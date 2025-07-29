// src/components/MaskedInput.tsx
import React from 'react';
import InputMask from 'react-input-mask';

interface MaskedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mask: string;
}

const MaskedInput: React.FC<MaskedInputProps> = ({ mask, ...props }) => {
  return (
    <InputMask mask={mask} {...props}>
      {(inputProps: any) => (
        <input
          {...inputProps}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      )}
    </InputMask>
  );
};

export default MaskedInput;
