import httpx
import json
from typing import Dict, Any, Optional

OLLAMA_URL = "http://localhost:11434/api/generate"

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
    )
}

import os

async def call_external_llm(prompt: str, provider: str, api_key: str, response_format: str = "text") -> Optional[str]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            if provider == "Gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
                body = {
                    "contents": [{"parts": [{"text": prompt}]}]
                }
                if response_format == "json":
                    body["generationConfig"] = {"responseMimeType": "application/json"}
                
                resp = await client.post(url, json=body)
                if resp.status_code == 200:
                    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                    
            elif provider == "OpenAI":
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                body = {
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}]
                }
                if response_format == "json":
                    body["response_format"] = {"type": "json_object"}
                    
                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"]
                    
            elif provider == "Groq":
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                body = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}]
                }
                if response_format == "json":
                    body["response_format"] = {"type": "json_object"}
                    
                resp = await client.post(url, headers=headers, json=body)
                if resp.status_code == 200:
                    return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Error calling {provider} API: {e}")
    return None

async def generate_tutor_response(
    prompt: str,
    mode: str = "Intermediate",
    context_data: Optional[Dict[str, Any]] = None,
    provider: Optional[str] = None,
    api_key: Optional[str] = None
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
        if context_data.get('rule_engine_calculation'):
            context_str += (
                f"Rule Engine Correct Calculation: {context_data.get('rule_engine_calculation')}\n"
                f"(IMPORTANT: Use this calculation as the absolute source of truth. Explain it step-by-step to the student. "
                f"Do not recalculate or output conflicting results.)\n"
            )
    
    full_prompt = f"{system_instruction}\n{context_str}\nStudent Question: {prompt}\n\nAnswer:"
    
    # 1. Resolve Provider and Key
    chosen_provider = provider or "Ollama"
    chosen_key = api_key
    if not chosen_key:
        if chosen_provider == "Gemini":
            chosen_key = os.getenv("GEMINI_API_KEY")
        elif chosen_provider == "OpenAI":
            chosen_key = os.getenv("OPENAI_API_KEY")
        elif chosen_provider == "Groq":
            chosen_key = os.getenv("GROQ_API_KEY")

    # 2. Try external provider first if configured
    if chosen_provider in ["Gemini", "OpenAI", "Groq"] and chosen_key:
        response_text = await call_external_llm(full_prompt, chosen_provider, chosen_key)
        if response_text:
            return response_text

    # 3. Fallback to local Ollama
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(OLLAMA_URL, json={
                "model": "qwen2.5-coder:7b",
                "prompt": full_prompt,
                "stream": False
            })
            if response.status_code == 200:
                return response.json().get("response", "No response content.")
            else:
                fallback_response = await client.post(OLLAMA_URL, json={
                    "model": "llama3.2:1b",
                    "prompt": full_prompt,
                    "stream": False
                })
                if fallback_response.status_code == 200:
                    return fallback_response.json().get("response", "No response content.")
                return f"Ollama returned status code {response.status_code}. Make sure Ollama is running."
    except httpx.ConnectError:
        return "Could not connect to local Ollama server at http://localhost:11434. Please verify Ollama is running (`ollama run qwen2.5-coder:7b`)."
    except Exception as e:
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
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    system_instruction = SYSTEM_PROMPTS.get(difficulty, "") if difficulty else ""

    brief_lines = [f"Teach {topic} to {audience}."]
    if duration:
        brief_lines.append(f"Total lesson duration: {duration}. Pace the number and depth of slides to fit this time.")
    if difficulty:
        brief_lines.append(f"Difficulty level: {difficulty}.")
    if teaching_style:
        brief_lines.append(f"Teaching style: {teaching_style}.")
    if not include_quizzes:
        brief_lines.append("Do not include quizQuestion, quizOptions, or quizAnswer on any slide (omit those fields entirely).")
    if not generate_narration:
        brief_lines.append("Do not include a narration field on any slide (omit it entirely).")

    full_prompt = f"{system_instruction}\n{' '.join(brief_lines)}\n{LESSON_SCHEMA_INSTRUCTIONS}"

    # 1. Resolve Provider and Key
    chosen_provider = provider or "Ollama"
    chosen_key = api_key
    if not chosen_key:
        if chosen_provider == "Gemini":
            chosen_key = os.getenv("GEMINI_API_KEY")
        elif chosen_provider == "OpenAI":
            chosen_key = os.getenv("OPENAI_API_KEY")
        elif chosen_provider == "Groq":
            chosen_key = os.getenv("GROQ_API_KEY")

    # 2. Try external provider
    if chosen_provider in ["Gemini", "OpenAI", "Groq"] and chosen_key:
        raw_text = await call_external_llm(full_prompt, chosen_provider, chosen_key, response_format="json")
        if raw_text:
            try:
                return _extract_json_object(raw_text)
            except (ValueError, json.JSONDecodeError):
                pass

    # 3. Fallback to local Ollama
    async def _call(model: str) -> Optional[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=180.0) as client:
            response = await client.post(OLLAMA_URL, json={
                "model": model,
                "prompt": full_prompt,
                "stream": False,
                "format": "json"
            })
            if response.status_code != 200:
                return None
            raw_text = response.json().get("response", "")
            try:
                return _extract_json_object(raw_text)
            except (ValueError, json.JSONDecodeError):
                return None

    try:
        lesson = await _call("qwen2.5-coder:7b")
        if lesson is None:
            lesson = await _call("llama3.2:1b")
        if lesson is None:
            raise ValueError("Local LLM did not return a parseable lesson JSON object. Verify Ollama is running and the model is loaded.")
        return lesson
    except httpx.ConnectError:
        raise ValueError("Could not connect to local Ollama server at http://localhost:11434. Please verify Ollama is running (`ollama run qwen2.5-coder:7b`).")
