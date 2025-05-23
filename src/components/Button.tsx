import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = 'button',
  fullWidth = false,
  variant = 'primary',
  className,
}) => {
  const baseClasses = "px-6 py-3 rounded-full font-medium text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50";

  const variantClasses = {
    // Alterado para um box-shadow personalizado e um gradiente sutil
    primary: "text-black \
              bg-gradient-to-b from-white to-gray-50 \
              shadow-[0_1px_2px_rgba(0,0,0,0.05),_0_0px_0_1px_rgba(0,0,0,0.03)] \
              hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),_0_0px_0_1px_rgba(0,0,0,0.05)] \
              focus:ring-gray-300",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-900 focus:ring-gray-200"
  };

  const widthClass = fullWidth ? "w-full" : "";

  const finalClasses = `${baseClasses} ${variantClasses[variant]} ${widthClass} ${className || ''}`;

  return (
    <motion.button
      type={type}
      className={finalClasses}
      onClick={onClick}
      whileTap={{ scale: 0.97 }} // Levemente mais de "apertar"
      whileHover={{ scale: 1.02 }} // Levemente mais de "levitar"
    >
      {children}
    </motion.button>
  );
};

export default Button;