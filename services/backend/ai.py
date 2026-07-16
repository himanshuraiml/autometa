import asyncio
import json
import logging
import os
from typing import Any, Callable, Dict, Optional, Tuple

import httpx

from config import settings

logger = logging.getLogger("autometa.ai")

# Status codes worth retrying: rate limits and transient upstream failures.
TRANSIENT_STATUS = {408, 429, 500, 502, 503, 504}

LESSON_SCHEMA_INSTRUCTIONS = """
You are an AI curriculum designer for "Autometa", a computer science automata theory app.
Output ONLY a single strict JSON object (no prose, no markdown code fences, no commentary before or after)
matching exactly this schema:

{
  "topic": string,
  "learningObjectives": [string],        // 3-6 short "students will be able to..." style objectives for the whole lesson
  "slides": [
    {
      "title": string,
      "markdown": string,               // 1-3 short paragraphs and/or bullet points explaining this slide's sub-concept. Use \\(...\\) for inline LaTeX math, never $...$.
      "narration": string,               // a short spoken-style narration script a teacher would read aloud while presenting this slide
      "diagram": {                       // OPTIONAL. Only include when a concrete automaton usefully illustrates this slide.
        "type": "DFA" | "NFA" | "Mealy" | "Moore" | "PDA" | "TM",
        "nodes": [
          { "id": string, "label": string, "isStart": boolean, "isAccept": boolean, "x": number, "y": number }
        ],
        "edges": [
          { "id": string, "source": string, "target": string, "label": string }
        ],
        "exampleInput": string           // a short input string that demonstrates this automaton when simulated
      },
      "quizQuestion": string,            // OPTIONAL single multiple-choice concept-check question for this slide
      "quizOptions": [string],           // OPTIONAL 3-4 answer options
      "quizAnswer": number               // OPTIONAL zero-based index into quizOptions of the correct answer
    }
  ],
  "summary": string,                     // a concise wrap-up summary of the whole lesson (2-4 sentences)
  "worksheet": [
    { "question": string, "answer": string }   // 3-5 practice questions with model answers, increasing in difficulty
  ]
}

Rules:
- Produce 3 to 6 slides ordered from simplest to most advanced.
- Node ids inside one diagram must be unique and referenced correctly by every edge's source/target.
- Space node x positions at least 150 apart (e.g. 100, 300, 500, ...) and keep y around 200 so the diagram renders without overlap.
- Exactly one node per diagram should have "isStart": true.
- Only set "diagram" on a slide when a concrete automaton genuinely helps teach that slide's idea.
- Keep JSON valid: no trailing commas, no comments, all strings double-quoted.
"""


def _extract_json_object(text: str) -> Dict[str, Any]:
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in model response.")
    return json.loads(text[start:end])


SYSTEM_PROMPTS = {
    "Beginner": (
        "You are an AI computer science tutor explaining concepts to an absolute beginner. "
        "Explain things simply using analogies (e.g. DFA as a vending machine). Avoid complex mathematical notations "
        "and focus on building intuition."
    ),
    "Intermediate": (
        "You are an AI computer science tutor explaining concepts to an undergraduate student. "
        "Use correct terms (e.g., states, transitions, alphabets, languages) and explain both the theory "
        "and practical examples."
    ),
    "Advanced": (
        "You are an AI computer science tutor explaining concepts to a senior student. "
        "Provide formal definitions (e.g., the 5-tuple representation of DFA/NFA) and go into depth regarding theoretical bounds."
    ),
    "Professor": (
        "You are a computer science professor explaining concepts to graduate researchers. "
        "Be extremely rigorous, formal, and reference classic CS textbooks (e.g., Sipser, Hopcroft). "
        "Encourage theoretical proofs and formal language properties."
    ),
}

ENV_KEY_BY_PROVIDER = {
    "Gemini": "GEMINI_API_KEY",
    "OpenAI": "OPENAI_API_KEY",
    "Groq": "GROQ_API_KEY",
}


def resolve_provider_and_key(
    provider: Optional[str], api_key: Optional[str]
) -> Tuple[str, Optional[str]]:
    """Request-supplied key wins; otherwise fall back to the provider's env var."""
    chosen_provider = provider or "Ollama"
    chosen_key = api_key
    if not chosen_key:
        env_name = ENV_KEY_BY_PROVIDER.get(chosen_provider)
        if env_name:
            chosen_key = os.getenv(env_name)
    return chosen_provider, chosen_key


def external_llm_ready(
    provider: str, api_key: Optional[str], base_url: Optional[str], model: Optional[str]
) -> bool:
    if provider in ("Gemini", "OpenAI", "Groq"):
        return bool(api_key)
    if provider == "Custom":
        return bool(base_url and model)
    return False


async def _post_with_retries(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    label: str,
) -> httpx.Response:
    """POST with exponential backoff on transient transport errors and status codes.

    `label` is used for logging instead of the URL so credentials or private
    hosts never end up in log lines.
    """
    retries = max(settings.llm_retries, 0)
    attempt = 0
    while True:
        try:
            resp = await client.post(url, headers=headers, json=json_body)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if attempt >= retries:
                raise
            delay = min(2**attempt, 8)
            logger.warning(
                "%s request failed (%s); retry %d/%d in %ds",
                label, type(exc).__name__, attempt + 1, retries, delay,
            )
            await asyncio.sleep(delay)
            attempt += 1
            continue

        if resp.status_code in TRANSIENT_STATUS and attempt < retries:
            delay = min(2**attempt, 8)
            logger.warning(
                "%s returned HTTP %d; retry %d/%d in %ds",
                label, resp.status_code, attempt + 1, retries, delay,
            )
            await asyncio.sleep(delay)
            attempt += 1
            continue
        return resp


def _build_external_request(
    provider: str,
    prompt: str,
    api_key: str,
    response_format: str,
    model: Optional[str],
    base_url: Optional[str],
) -> Tuple[str, Dict[str, str], Dict[str, Any], Callable[[Dict[str, Any]], str]]:
    """Returns (url, headers, body, extractor) for the given provider."""
    if provider == "Gemini":
        chosen_model = model or "gemini-2.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{chosen_model}:generateContent"
        # Key travels in a header, never in the URL, so it cannot leak into logs.
        headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
        body: Dict[str, Any] = {"contents": [{"parts": [{"text": prompt}]}]}
        if response_format == "json":
            body["generationConfig"] = {"responseMimeType": "application/json"}
        return url, headers, body, lambda d: d["candidates"][0]["content"]["parts"][0]["text"]

    # Everything else speaks the OpenAI chat-completions dialect.
    if provider == "OpenAI":
        url = "https://api.openai.com/v1/chat/completions"
        default_model = "gpt-4o-mini"
    elif provider == "Groq":
        url = "https://api.groq.com/openai/v1/chat/completions"
        default_model = "llama-3.3-70b-versatile"
    elif provider == "Custom":
        # Any OpenAI-compatible endpoint (OpenRouter, Together, LM Studio, vLLM).
        # base_url and model are required; api_key is optional for local servers.
        if not base_url or not model:
            raise ValueError("Custom provider requires both base_url and model.")
        url = base_url.rstrip("/")
        if not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"
        default_model = model
    else:
        raise ValueError(f"Unknown provider: {provider}")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": model or default_model,
        "messages": [{"role": "user", "content": prompt}],
    }
    if response_format == "json":
        body["response_format"] = {"type": "json_object"}
    return url, headers, body, lambda d: d["choices"][0]["message"]["content"]


async def call_external_llm(
    prompt: str,
    provider: str,
    api_key: str,
    response_format: str = "text",
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Optional[str]:
    try:
        url, headers, body, extract = _build_external_request(
            provider, prompt, api_key, response_format, model, base_url
        )
    except ValueError as exc:
        logger.error("LLM request misconfigured: %s", exc)
        return None

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout) as client:
            resp = await _post_with_retries(
                client, url, headers=headers, json_body=body, label=f"{provider} API"
            )
            if resp.status_code != 200:
                logger.error(
                    "%s API returned HTTP %d: %s",
                    provider, resp.status_code, resp.text[:300],
                )
                return None
            return extract(resp.json())
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.error("Error calling %s API: %s: %s", provider, type(exc).__name__, exc)
        return None


async def _call_ollama(
    prompt: str,
    model: str,
    *,
    response_format: Optional[str] = None,
    timeout: float,
) -> httpx.Response:
    body: Dict[str, Any] = {"model": model, "prompt": prompt, "stream": False}
    if response_format:
        body["format"] = response_format
    async with httpx.AsyncClient(timeout=timeout) as client:
        return await _post_with_retries(
            client, settings.ollama_url, json_body=body, label=f"Ollama ({model})"
        )


async def generate_tutor_response(
    prompt: str,
    mode: str = "Intermediate",
    context_data: Optional[Dict[str, Any]] = None,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> str:
    system_instruction = SYSTEM_PROMPTS.get(mode, SYSTEM_PROMPTS["Intermediate"])

    context_str = ""
    if context_data:
        context_str = (
            f"\n[Automaton Context]\n"
            f"Type: {context_data.get('type')}\n"
            f"Nodes: {context_data.get('nodes')}\n"
            f"Transitions: {context_data.get('edges')}\n"
            f"Input String: {context_data.get('input_string')}\n"
        )
        if context_data.get("rule_engine_calculation"):
            context_str += (
                f"Rule Engine Correct Calculation: {context_data.get('rule_engine_calculation')}\n"
                f"(IMPORTANT: Use this calculation as the absolute source of truth. Explain it step-by-step to the student. "
                f"Do not recalculate or output conflicting results.)\n"
            )

    full_prompt = f"{system_instruction}\n{context_str}\nStudent Question: {prompt}\n\nAnswer:"

    chosen_provider, chosen_key = resolve_provider_and_key(provider, api_key)

    if external_llm_ready(chosen_provider, chosen_key, base_url, model):
        response_text = await call_external_llm(
            full_prompt, chosen_provider, chosen_key or "", model=model, base_url=base_url
        )
        if response_text:
            return response_text
        logger.warning("External provider %s failed; falling back to Ollama", chosen_provider)

    try:
        response = await _call_ollama(
            full_prompt, settings.ollama_model, timeout=settings.llm_timeout
        )
        if response.status_code == 200:
            return response.json().get("response", "No response content.")

        logger.warning(
            "Ollama model %s returned HTTP %d; trying fallback model",
            settings.ollama_model, response.status_code,
        )
        fallback_response = await _call_ollama(
            full_prompt, settings.ollama_fallback_model, timeout=settings.llm_timeout
        )
        if fallback_response.status_code == 200:
            return fallback_response.json().get("response", "No response content.")
        return (
            f"Ollama returned status code {response.status_code}. "
            "Make sure Ollama is running."
        )
    except httpx.ConnectError:
        return (
            f"Could not connect to local Ollama server at {settings.ollama_url}. "
            f"Please verify Ollama is running (`ollama run {settings.ollama_model}`)."
        )
    except httpx.HTTPError as e:
        logger.error("Ollama request failed: %s: %s", type(e).__name__, e)
        return f"Error communicating with local LLM ({type(e).__name__}): {str(e)}"


async def generate_lesson(
    topic: str,
    audience: str = "first-year students",
    duration: Optional[str] = None,
    difficulty: Optional[str] = None,
    teaching_style: Optional[str] = None,
    include_quizzes: bool = True,
    generate_narration: bool = True,
    provider: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    system_instruction = SYSTEM_PROMPTS.get(difficulty, "") if difficulty else ""

    brief_lines = [f"Teach {topic} to {audience}."]
    if duration:
        brief_lines.append(
            f"Total lesson duration: {duration}. Pace the number and depth of slides to fit this time."
        )
    if difficulty:
        brief_lines.append(f"Difficulty level: {difficulty}.")
    if teaching_style:
        brief_lines.append(f"Teaching style: {teaching_style}.")
    if not include_quizzes:
        brief_lines.append(
            "Do not include quizQuestion, quizOptions, or quizAnswer on any slide (omit those fields entirely)."
        )
    if not generate_narration:
        brief_lines.append("Do not include a narration field on any slide (omit it entirely).")

    full_prompt = f"{system_instruction}\n{' '.join(brief_lines)}\n{LESSON_SCHEMA_INSTRUCTIONS}"

    chosen_provider, chosen_key = resolve_provider_and_key(provider, api_key)

    if external_llm_ready(chosen_provider, chosen_key, base_url, model):
        raw_text = await call_external_llm(
            full_prompt,
            chosen_provider,
            chosen_key or "",
            response_format="json",
            model=model,
            base_url=base_url,
        )
        if raw_text:
            try:
                return _extract_json_object(raw_text)
            except (ValueError, json.JSONDecodeError):
                logger.warning(
                    "External provider %s returned unparseable lesson JSON; falling back to Ollama",
                    chosen_provider,
                )

    async def _lesson_from_ollama(ollama_model: str) -> Optional[Dict[str, Any]]:
        response = await _call_ollama(
            full_prompt, ollama_model, response_format="json", timeout=settings.lesson_timeout
        )
        if response.status_code != 200:
            logger.warning(
                "Ollama model %s returned HTTP %d for lesson generation",
                ollama_model, response.status_code,
            )
            return None
        raw_text = response.json().get("response", "")
        try:
            return _extract_json_object(raw_text)
        except (ValueError, json.JSONDecodeError):
            logger.warning("Ollama model %s returned unparseable lesson JSON", ollama_model)
            return None

    try:
        lesson = await _lesson_from_ollama(settings.ollama_model)
        if lesson is None:
            lesson = await _lesson_from_ollama(settings.ollama_fallback_model)
        if lesson is None:
            raise ValueError(
                "Local LLM did not return a parseable lesson JSON object. "
                "Verify Ollama is running and the model is loaded."
            )
        return lesson
    except httpx.ConnectError:
        raise ValueError(
            f"Could not connect to local Ollama server at {settings.ollama_url}. "
            f"Please verify Ollama is running (`ollama run {settings.ollama_model}`)."
        )
