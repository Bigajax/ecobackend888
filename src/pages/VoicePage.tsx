import React from 'react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import VoiceRecorder from '../components/VoiceRecorder';

const VoicePage: React.FC = () => {
  return (
    <PhoneFrame>
      <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Header title="ECO" showBackButton={true} />
        <div className="flex-1 flex items-center justify-center">
          <VoiceRecorder />
        </div>
      </div>
    </PhoneFrame>
  );
};

export default VoicePage;