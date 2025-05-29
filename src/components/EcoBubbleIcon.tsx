import React from 'react';

const EcoBubbleIcon: React.FC = () => {
    return (
        <div
            className="w-8 h-8 rounded-full shadow-md"
            style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(240,240,255,0.4))',
                border: '1px solid rgba(200, 220, 255, 0.4)',
                boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
            }}
        />
    );
};

export default EcoBubbleIcon;
