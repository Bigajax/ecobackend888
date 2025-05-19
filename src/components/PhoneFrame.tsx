import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PhoneFrameProps {
  children: ReactNode;
  className?: string; // Adicionando a possibilidade de passar classes extras
}

const PhoneFrame: React.FC<PhoneFrameProps> = ({ children, className }) => {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div
        className={`relative w-full bg-white rounded-[40px] shadow-lg overflow-hidden flex flex-col h-full ${className ? className : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
};

export default PhoneFrame;