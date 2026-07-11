import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  glow?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  glow = false,
  className = '', 
  ...props 
}) => {
  const baseStyles = 'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-[#070a13] disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-gradient-to-r from-[#00f0ff] to-[#0072ff] hover:from-[#33f3ff] hover:to-[#338eff] text-black font-semibold shadow-glow-blue',
    secondary: 'glass-button text-gray-200 hover:text-white',
    danger: 'bg-gradient-to-r from-[#ff007f] to-[#aa0055] hover:from-[#ff3399] hover:to-[#cc0066] text-white focus:ring-pink-500',
    ghost: 'text-gray-400 hover:text-white hover:bg-white/5'
  };

  const glowStyles = glow && variant === 'primary' ? 'shadow-glow-blue' : '';

  return (
    <button 
      className={`${baseStyles} ${variants[variant as keyof typeof variants]} ${glowStyles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
