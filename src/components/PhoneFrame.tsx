import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

const PhoneFrame: React.FC<PhoneFrameProps> = ({ children, className }) => {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <motion.div
        className={`relative w-full h-[calc(100vh-2rem)] max-w-sm
                    rounded-3xl shadow-xl overflow-hidden
                    flex flex-col
                    ${className || ''}`}
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