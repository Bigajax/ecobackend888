import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';

const initialMessages: Message[] = [
  {
    id: '1',
    text: 'Como você tem se sentido ultimamente?',
    sender: 'eco',
  },
];

const followUpResponses = [
  {
    id: 'response1',
    text: 'Uma reflexão profunda. Que respostas você encontrou até agora?',
    sender: 'eco' as const,
  },
  {
    id: 'response2',
    text: 'Entendo. E como isso tem afetado seu dia a dia?',
    sender: 'eco' as const,
  },
  {
    id: 'response3',
    text: 'Interessante. Você consegue identificar quando começou a se sentir assim?',
    sender: 'eco' as const,
  },
  {
    id: 'response4',
    text: 'Se pudesse mudar algo nesse aspecto da sua vida, o que seria?',
    sender: 'eco' as const,
  },
];

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (text: string) => {
    const newUserMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
    };
    
    setMessages((prev) => [...prev, newUserMessage]);
    
    setTimeout(() => {
      const randomResponse = followUpResponses[Math.floor(Math.random() * followUpResponses.length)];
      
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: randomResponse.text,
          sender: 'eco',
        },
      ]);
    }, 1000);
  };

  const goToVoiceMode = () => {
    navigate('/voice');
  };

  return (
    <PhoneFrame>
      <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        <Header title="ECO" showBackButton={false} />
        
        <div className="flex-1 overflow-y-auto p-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="p-4 flex justify-center">
          <motion.button
            onClick={goToVoiceMode}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Mic size={24} />
          </motion.button>
        </div>
        
        <ChatInput onSendMessage={handleSendMessage} />
      </div>
    </PhoneFrame>
  );
};

export default ChatPage;