import React, { useState } from 'react';
import ChatMessage from './ChatMessage';
import { ClipboardCopy, ThumbsUp, ThumbsDown, Volume2 } from 'lucide-react';
import AudioPlayerOverlay from './AudioPlayerOverlay';
import { gerarAudioDaMensagem } from '../api/voiceApi';
import { Message } from '../contexts/ChatContext';

interface EcoMessageWithAudioProps {
  message: Message;
}

const EcoMessageWithAudio: React.FC<EcoMessageWithAudioProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const iconClass = 'w-4 h-4 text-gray-500 group-hover:text-black';
  const displayText = message.text ?? message.content ?? '';

  const copiarTexto = () => {
    navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reproduzirAudio = async () => {
    try {
      const blob = await gerarAudioDaMensagem(displayText);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      console.error('Erro ao gerar áudio:', err);
    }
  };

  return (
    <>
      <div className="flex flex-col items-start">
        <ChatMessage message={message} />
        <div className="flex gap-1 mt-2 ml-3">
          <button onClick={copiarTexto} className="group p-1 rounded-md hover:bg-gray-100" aria-label="Copiar">
            <ClipboardCopy className={iconClass} />
          </button>
          <button className="group p-1 rounded-md hover:bg-gray-100" aria-label="Like">
            <ThumbsUp className={iconClass} />
          </button>
          <button className="group p-1 rounded-md hover:bg-gray-100" aria-label="Dislike">
            <ThumbsDown className={iconClass} />
          </button>
          <button onClick={reproduzirAudio} className="group p-1 rounded-md hover:bg-gray-100" aria-label="Ouvir">
            <Volume2 className={iconClass} />
          </button>
        </div>
        {copied && (
          <span className="text-xs text-gray-400 ml-3 mt-1">Copiado!</span>
        )}
      </div>

      {audioUrl && (
        <AudioPlayerOverlay audioUrl={audioUrl} onClose={() => setAudioUrl(null)} />
      )}
    </>
  );
};

export default EcoMessageWithAudio;
