import React from 'react';
import { motion } from 'framer-motion';

interface InputProps {
  type: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  required?: boolean;
  autoComplete?: string;
}

const Input: React.FC<InputProps> = ({
  type,
  placeholder,
  value,
  onChange,
  name,
  required = false,
  autoComplete,
}) => {
  return (
    <motion.div
      className="mb-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        name={name}
        required={required}
        autoComplete={autoComplete}
        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-800
                   focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                   placeholder-gray-400 transition-all duration-200"
      />
    </motion.div>
  );
};

export default Input;