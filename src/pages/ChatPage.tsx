import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import Header from '../components/Header';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { enviarMensagemParaEco } from '../api/ecoApi';
import { salvarMemoria } from '../api/memoria';
import { useAuth } from '../contexts/AuthContext'; // Certifique-se de que AuthContext tem a função logout
import { useChat, Message } from '../contexts/ChatContext'; // Certifique-se de que ChatContext tem a função clearMessages

// Definindo os tipos de opção para o 'Mais' (deve ser o mesmo tipo do ChatInput)
type MoreOption = 'save_memory' | 'go_to_voice_page';

const ChatPage: React.FC = () => {
    // Adicionado: 'logout' do useAuth e 'clearMessages' do useChat
    const { messages, addMessage, updateMessage, clearMessages } = useChat();
    const { user, logout } = useAuth();

    const [digitando, definirDigitando] = useState(false);
    const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);
    const navegar = useNavigate();
    const [mensagemASalvar, setMensagemASalvar] = useState<string | null>(null);
    const [mensagemDeSucesso, setMensagemDeSucesso] = useState<string | null>(null);
    const [ultimaMensagemEco, setUltimaMensagemEco] = useState<Message | null>(null);
    const [ultimaEmocaoDetectada, setUltimaEmocaoDetectada] = useState<string | null>(null);
    const [ultimaIntensidadeDetectada, setUltimaIntensidadeDetectada] = useState<number | null>(null);
    const [feedback, setFeedback] = useState<{ [messageId: string]: 'like' | 'dislike' | null }>({});
    const [erroApi, setErroApi] = useState<string | null>(null);

    // Mensagem de boas-vindas para exibição visual no topo (título solto)
    // Ajuste aqui para o formato "Olá [nome do usuário]!"
    const mensagemBoasVindasDisplay = user?.full_name ? `Olá, ${user.full_name}!` : 'Olá!';

    useEffect(() => {
        referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
        const ultimaEco = messages.slice().reverse().find(msg => msg.sender === 'eco');
        setUltimaMensagemEco(ultimaEco || null);
    }, [messages]);

    const handleCopyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleSpeakMessage = (text: string) => {
        alert("Funcionalidade de Text-to-Speech será implementada aqui.");
    };

    const handleStopSpeak = () => {
        // Lógica para interromper a fala
    };

    const handleLikeMessage = (messageId: string) => {
        setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'like' ? null : 'like' }));
        console.log('Mensagem curtida:', messageId);
    };

    const handleDislikeMessage = (messageId: string) => {
        setFeedback(prev => ({ ...prev, [messageId]: prev[messageId] === 'dislike' ? null : 'dislike' }));
        console.log('Mensagem descurtida:', messageId);
    };

    const handleRegenerateResponse = async (messageId: string) => {
        definirDigitando(true);
        const indiceMensagemARegenerar = messages.findIndex(msg => msg.id === messageId);
        if (indiceMensagemARegenerar === -1) {
            console.warn("Mensagem a regenerar não encontrada.");
            definirDigitando(false);
            return;
        }

        const historicoParaRegenerar = messages.slice(0, indiceMensagemARegenerar + 1).filter(msg => msg.sender === 'user' || msg.sender === 'eco');

        const mappedHistory = historicoParaRegenerar.map(msg => ({
            role: msg.sender === 'eco' ? 'assistant' : 'user',
            content: msg.text || ''
        }));

        try {
            const novaResposta = await enviarMensagemParaEco(mappedHistory, user?.full_name || "Usuário");
            updateMessage(messageId, novaResposta);
            setErroApi(null);
        } catch (error: any) {
            console.error("Erro ao regenerar resposta:", error);
            setErroApi(error.message || "Erro ao tentar regenerar a resposta.");
        } finally {
            definirDigitando(false);
        }
    };

    const lidarComEnvioDeMensagem = async (texto: string) => {
        const mensagemDoUsuario: Message = { id: uuidv4(), text: texto, sender: 'user' };
        addMessage(mensagemDoUsuario);
        definirDigitando(true);
        setMensagemASalvar(texto);
        setErroApi(null);

        const historicoAtualizado = [...messages, mensagemDoUsuario].map(msg => ({
            role: msg.sender === 'eco' ? 'assistant' : 'user',
            content: msg.text || ''
        }));

        try {
            const resposta = await enviarMensagemParaEco(historicoAtualizado, user?.full_name || "Usuário");

            const mensagemDaEco: Message = { id: uuidv4(), text: resposta, sender: 'eco' };
            addMessage(mensagemDaEco);
            setUltimaMensagemEco(mensagemDaEco);
        } catch (erro: any) {
            console.error("Erro ao enviar mensagem para a ECO:", erro);
            setErroApi(erro.message || "Erro ao enviar mensagem.");
        } finally {
            definirDigitando(false);
        }
    };

    // NOVA FUNÇÃO para lidar com o áudio gravado
    const handleSendAudio = async (audioBlob: Blob) => {
        console.log("Áudio gravado:", audioBlob);
        definirDigitando(true);
        setErroApi(null);

        const audioUrl = URL.createObjectURL(audioBlob); // Cria uma URL temporária para o áudio
        const mensagemAudio: Message = { id: uuidv4(), text: 'Mensagem de áudio', sender: 'user', audioUrl: audioUrl };
        addMessage(mensagemAudio); // Adiciona uma mensagem indicando que é um áudio

        // TODO: Implementar o envio do Blob de áudio para a sua API (backend)
        // Isso pode envolver:
        // 1. Converter o Blob em um FormData.
        // 2. Enviar o FormData para um endpoint de API que processe o áudio (Speech-to-Text).
        // 3. Receber a transcrição do áudio e talvez a resposta da Eco.

        try {
            // Exemplo de como você enviaria para uma API (requer implementação no backend)
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio_message.webm');
            formData.append('userId', user?.id || 'anonymous');
            formData.append('userName', user?.full_name || 'Usuário');

            // Exemplo de requisição (AJUSTE PARA SUA API REAL)
            // const response = await fetch('/api/transcribe-audio', {
            //   method: 'POST',
            //   body: formData,
            // });
            // const data = await response.json();

            // Placeholder: Simular uma resposta após um tempo
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simula tempo de processamento
            const transcribedText = "Esta é uma transcrição de teste do seu áudio."; // Substitua pela transcrição real
            const ecoResponse = `Entendi que você disse: "${transcribedText}"`;

            // Atualiza a mensagem do usuário com a transcrição se desejar
            updateMessage(mensagemAudio.id, transcribedText);
            addMessage({ id: uuidv4(), text: ecoResponse, sender: 'eco' });
        } catch (error: any) {
            console.error("Erro ao enviar áudio:", error);
            setErroApi(error.message || "Erro ao enviar áudio.");
        } finally {
            definirDigitando(false);
        }
    };

    const handleOpenMemoryHistory = () => {
        console.log("Abrindo histórico de memórias, navegando para /memory");
        navegar('/memory');
    };

    const handleSaveMemory = async () => {
        if (!user?.id) {
            console.error("Usuário não autenticado para salvar memória.");
            setErroApi("Você precisa estar logado para salvar memórias.");
            return;
        }

        if (!ultimaMensagemEco || !mensagemASalvar) {
            setMensagemDeSucesso("Não há uma conversa recente para salvar como memória.");
            setTimeout(() => setMensagemDeSucesso(null), 3000);
            return;
        }

        try {
            await salvarMemoria({
                usuarioId: user.id,
                mensagemId: ultimaMensagemEco.id,
                resumoEco: ultimaMensagemEco.text || 'Memória sem resumo',
                dataRegistro: new Date().toISOString(),
                emocaoPrincipal: ultimaEmocaoDetectada || 'N/A',
                intensidade: ultimaIntensidadeDetectada || 0,
                contexto: mensagemASalvar,
                salvarMemoria: true,
            });
            setMensagemDeSucesso("Memória salva com sucesso!");
            setTimeout(() => setMensagemDeSucesso(null), 3000);
        } catch (error: any) {
            console.error("Erro ao salvar memória:", error);
            setErroApi(`Erro ao salvar memória: ${error.message}`);
        }
    };

    const irParaModoDeVoz = () => {
        navegar('/voice');
    };

    const handleMoreOptionSelected = (option: MoreOption) => {
        if (option === 'save_memory') {
            handleSaveMemory();
        } else if (option === 'go_to_voice_page') {
            irParaModoDeVoz();
        }
    };

    // NOVA FUNÇÃO DE LOGOUT
    const handleLogout = async () => {
        try {
            await logout(); // Chama a função de logout do AuthContext (que limpa o token e o usuário)
            clearMessages(); // Limpa o histórico de mensagens do chat (do ChatContext)
            navegar('/login'); // Redireciona para a página de login
            console.log("Usuário deslogado e histórico do chat limpo.");
        } catch (error) {
            console.error("Erro ao fazer logout:", error);
            setErroApi("Erro ao fazer logout. Tente novamente.");
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
            {/* O comentário problemático foi movido para uma linha separada acima da prop */}
            {/* Passamos a nova função de logout para o Header */}
            <Header
                title="ECO"
                showBackButton={false} // Mantém false se não quiser o botão de voltar neste header
                onOpenMemoryHistory={handleOpenMemoryHistory}
                mensagemDeSucesso={mensagemDeSucesso}
                onLogout={handleLogout}
            />
            <div className="flex-1 flex overflow-y-auto p-4 flex-col items-center">
                <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto flex flex-col items-center">
                    {messages.length === 0 && !erroApi && (
                        <motion.div
                            className="text-center text-gray-600 mb-20 mt-16"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <h2 className="text-4xl font-light" style={{
                                background: 'linear-gradient(to right, #AEC6CF, #B0C4DE, #DDA0DD)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>
                                {mensagemBoasVindasDisplay}
                            </h2>
                            <p className="text-xl font-light text-gray-500 mt-2" style={{
                                background: 'linear-gradient(to right, #AEC6CF, #B0C4DE, #DDA0DD)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>
                                Sou a ECO, pronta para refletir com você.
                            </p>
                        </motion.div>
                    )}
                    {erroApi && (
                        <div className="text-red-500 text-center mb-4">
                            Erro: {erroApi}
                        </div>
                    )}
                    <div className="w-full">
                        {messages.map((mensagem) => (
                            <ChatMessage
                                key={mensagem.id}
                                message={mensagem}
                                onCopyToClipboard={handleCopyToClipboard}
                                onSpeak={handleSpeakMessage}
                                onLike={handleLikeMessage}
                                onDislike={handleDislikeMessage}
                                onRegenerate={mensagem.sender === 'eco' ? () => handleRegenerateResponse(mensagem.id) : undefined}
                            />
                        ))}
                        {digitando && (
                            <ChatMessage
                                message={{ id: 'digitando', text: 'Digitando...', sender: 'eco' }}
                            />
                        )}
                        <div ref={referenciaFinalDasMensagens} />
                    </div>
                </div>
            </div>
            <div className="flex justify-center w-full p-4">
                <div className="max-w-2xl w-full md:max-w-md lg:max-w-xl xl:max-w-2xl mx-auto">
                    {/* Passando a nova função como prop onSendAudio */}
                    <ChatInput
                        onSendMessage={lidarComEnvioDeMensagem}
                        onMoreOptionSelected={handleMoreOptionSelected}
                        onSendAudio={handleSendAudio}
                    />
                </div>
            </div>
        </div>
    );
};

export default ChatPage;