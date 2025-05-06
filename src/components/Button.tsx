import React from 'react';
import { motion } from 'framer-motion';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  fullWidth?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  type = 'button',
  fullWidth = false,
  variant = 'primary'
}) => {
  const baseClasses = "px-6 py-3 rounded-full font-medium text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-opacity-50";
  
  const variantClasses = {
    primary: "bg-black text-white hover:bg-gray-800 focus:ring-gray-500",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-300",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-900 focus:ring-gray-200"
  };
  
  const widthClass = fullWidth ? "w-full" : "";
  
  return (
    <motion.button
      type={type}
      className={`${baseClasses} ${variantClasses[variant]} ${widthClass}`}
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.01 }}
    >
      {children}
    </motion.button>
  );
};

export default Button;