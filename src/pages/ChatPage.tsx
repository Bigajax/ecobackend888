import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { askOpenRouter } from '../api/openrouter';

const initialMessages: Message[] = [
  {
    id: '1',
    text: 'Como você tem se sentido ultimamente?',
    sender: 'eco',
  },
];

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);

    const response = await askOpenRouter(text);

    const botMessage: Message = {
      id: (Date.now() + 1).toString(),
      text: response,
      sender: 'eco',
    };

    setMessages((prev) => [...prev, botMessage]);
    setIsTyping(false);
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
          {isTyping && (
            <ChatMessage message={{ id: 'typing', text: 'Digitando...', sender: 'eco' }} />
          )}
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
