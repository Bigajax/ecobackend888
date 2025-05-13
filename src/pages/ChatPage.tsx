import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, BookOpen, List } from 'lucide-react';
import { motion } from 'framer-motion';
import PhoneFrame from '../components/PhoneFrame';
import Header from '../components/Header';
import ChatMessage, { Message } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import { askOpenRouter } from '../api/openrouter';
import { gerarPromptMestre } from '../prompts/generatePrompt.ts';
import TelaDeHistoricoDeMemorias from '../components/TelaDeHistoricoDeMemorias';
import { salvarMemoria } from '../api/memoria'; // Importe a função salvarMemoria

const promptDoSistema = gerarPromptMestre();

interface EmotionalMemory {
    memoria: string;
    emocao: string;
}

const mensagensIniciais: Message[] = [];

const PaginaDeConversa: React.FC = () => {
    const [mensagens, definirMensagens] = useState<Message[]>(mensagensIniciais);
    const [digitando, definirDigitando] = useState(false);
    const referenciaFinalDasMensagens = useRef<HTMLDivElement>(null);
    const navegar = useNavigate();
    const [isMemoryHistoryOpen, setIsMemoryHistoryOpen] = useState(false);
    const [mensagemASalvar, setMensagemASalvar] = useState<string | null>(null);
    const [mensagemDeSucesso, setMensagemDeSucesso] = useState<string | null>(null); // Novo estado

    useEffect(() => {
        referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensagens]);

    const lidarComEnvioDeMensagem = async (texto: string) => {
        const mensagemDoUsuario: Message = {
            id: Date.now().toString(),
            text: texto,
            sender: 'user',
        };

        definirMensagens((anteriores) => [...anteriores, mensagemDoUsuario]);
        definirDigitando(true);
        setMensagemASalvar(texto);

        const mensagensParaEnvio = [
            { role: 'system', content: promptDoSistema },
            { role: 'user', content: texto },
        ];

        try {
            const resposta = await askOpenRouter(mensagensParaEnvio);
            const mensagemDaEco: Message = {
                id: (Date.now() + 1).toString(),
                text: resposta,
                sender: 'eco',
            };
            definirMensagens((anteriores) => [...anteriores, mensagemDaEco]);
        } catch (erro: any) {
            let mensagemDeErro = "Desculpe, ocorreu un error al procesar su mensaje. Por favor, intente de nuevo.";
            if (erro.response?.status === 401) {
                mensagemDeErro = "Error de autenticación. Por favor, verifique su clave de API.";
            } else if (erro.response?.status === 429) {
                mensagemDeErro =
                    "Límite de peticiones excedido. Por favor, intente de nuevo más tarde.";
            }
            const mensagemDeErroObj: Message = {
                id: (Date.now() + 2).toString(),
                text: mensagemDeErro,
                sender: 'eco',
            };
            definirMensagens((anterior) => [...anterior, mensagemDeErroObj]);
        } finally {
            definirDigitando(false);
        }
    };

    const irParaModoDeVoz = () => navegar('/voice');
    const irParaPaginaDeMemorias = () => navegar('/memory');

    const handleOpenMemoryHistory = () => {
        setIsMemoryHistoryOpen(!isMemoryHistoryOpen);
    };

    const handleSaveMemory = async () => {
        if (mensagemASalvar) {
            try {
                // Simule a lógica para obter o usuarioId e mensagemId
                const usuarioId = 'USUARIO_ID_SIMULADO';
                const mensagemId = Date.now().toString();
                await salvarMemoria({ usuarioId, mensagemId, resumoEco: mensagemASalvar });
                setMensagemDeSucesso('Emoção registrada com sucesso!'); // Define a mensagem de sucesso
                setTimeout(() => {
                    setMensagemDeSucesso(null); // Limpa a mensagem após alguns segundos
                }, 3000);
                setMensagemASalvar(null);
            } catch (error: any) {
                console.error("Erro ao salvar memória:", error);
                // Adicione aqui tratamento de erro para o usuário, se necessário
            }
        }
    };

    return (
        <PhoneFrame className="flex-grow h-full">
            <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
                <Header
                    title="ECO"
                    showBackButton={false}
                    onOpenMemoryHistory={handleOpenMemoryHistory}
                    mensagemDeSucesso={mensagemDeSucesso} // Passa a mensagem para o Header
                />
                <div className="flex-1 overflow-y-auto p-4">
                    {mensagens.map((mensagem) => (
                        <ChatMessage key={mensagem.id} message={mensagem} />
                    ))}
                    {digitando && (
                        <ChatMessage
                            message={{ id: 'digitando', text: 'Digitando...', sender: 'eco' }}
                        />
                    )}
                    <div ref={referenciaFinalDasMensagens} />
                </div>
                <ChatInput onSendMessage={lidarComEnvioDeMensagem} onSaveMemory={handleSaveMemory} />
            </div>
            {isMemoryHistoryOpen && (
                <TelaDeHistoricoDeMemorias onClose={() => setIsMemoryHistoryOpen(false)} />
            )}
        </PhoneFrame>
    );
};

export default PaginaDeConversa;

