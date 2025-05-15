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
    const [ultimaMensagemEco, setUltimaMensagemEco] = useState<Message | null>(null); // Novo estado para rastrear a última mensagem da Eco
    const [ultimaEmocaoDetectada, setUltimaEmocaoDetectada] = useState<string | null>(null);
    const [ultimaIntensidadeDetectada, setUltimaIntensidadeDetectada] = useState<number | null>(null);

    useEffect(() => {
        referenciaFinalDasMensagens.current?.scrollIntoView({ behavior: 'smooth' });
        // Atualiza a última mensagem da Eco
        const ultimaEco = mensagens.slice().reverse().find(msg => msg.sender === 'eco');
        setUltimaMensagemEco(ultimaEco || null);
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
            setUltimaMensagemEco(mensagemDaEco); // Atualiza a última mensagem da Eco

            // *** INÍCIO DAS ALTERAÇÕES PARA ANÁLISE DE SENTIMENTO REAL ***
            const sentimentResponse = await fetch('/api/analyze-sentiment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text: resposta }),
            });

            if (sentimentResponse.ok) {
                const sentimentData = await sentimentResponse.json();
                console.log('Dados de sentimento do backend:', sentimentData);

                const intensidadeReal = sentimentData?.magnitude || 0;
                const scoreReal = sentimentData?.score || 0;

                // *** SIMULAÇÃO DA IDENTIFICAÇÃO DA EMOÇÃO E INTENSIDADE ***
                let emocaoPrincipalSimulada: string | null = null;
                if (scoreReal > 0.2) {
                    emocaoPrincipalSimulada = 'Positivo';
                } else if (scoreReal < -0.2) {
                    emocaoPrincipalSimulada = 'Negativo';
                } else {
                    emocaoPrincipalSimulada = 'Neutro';
                }
                setUltimaEmocaoDetectada(emocaoPrincipalSimulada);
                setUltimaIntensidadeDetectada(intensidadeReal);
                // *** FIM DA SIMULAÇÃO ***

                if (Math.abs(scoreReal) > 0.5 || intensidadeReal > 2) {
                    const usuarioId = 'USUARIO_ID_SIMULADO'; // Substitua pelo ID real do usuário
                    const mensagemId = mensagemDaEco.id;
                    await salvarMemoria({
                        usuarioId,
                        mensagemId,
                        resumoEco: `${texto} -> ${resposta}`,
                        contexto: `Sentimento da Eco: score=${scoreReal}, magnitude=${intensidadeReal}`, // Opcional: salvar dados de sentimento
                        dataRegistro: new Date().toISOString(),
                        emocaoPrincipal: emocaoPrincipalSimulada,
                        intensidade: intensidadeReal,
                        tags: ['conversa', emocaoPrincipalSimulada || 'desconhecida'],
                    });
                    setMensagemDeSucesso('Memória registrada automaticamente com base no sentimento da Eco.');
                    setTimeout(() => setMensagemDeSucesso(null), 5000);
                }
            } else {
                console.error('Erro ao obter sentimento do backend:', sentimentResponse.status);
            }
            // *** FIM DAS ALTERAÇÕES PARA ANÁLISE DE SENTIMENTO REAL ***

        } catch (erro: any) {
            let mensagemDeErro = "Desculpe, ocorreu un error al procesar su mensaje. Por favor, intente de nuevo.";
            if (erro.response?.status === 401) {
                mensagemDeErro = "Error de autenticação. Por favor, verifique sua chave de API.";
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

    const handleRegistroManual = async () => {
        if (ultimaMensagemEco) {
            const usuarioId = 'USUARIO_ID_SIMULADO'; // Substitua pelo ID real do usuário
            const mensagemId = ultimaMensagemEco.id; // Ou gere um novo ID se preferir registrar a conversa como um todo
            const textoUsuario = mensagens.slice().reverse().find(msg => msg.sender === 'user')?.text || '';
            const resumoEco = `${textoUsuario} -> ${ultimaMensagemEco.text}`; // Adapte o resumo conforme necessário
            const dataRegistro = new Date().toISOString(); // Captura a data e hora atual
            const contextoMensagem = resumoEco; // Podemos usar o resumo como contexto imediato
            const emocaoPrincipal = ultimaEmocaoDetectada;
            const intensidadeEmocao = ultimaIntensidadeDetectada;
            const tagsExemplo = ['conversa', emocaoPrincipal || 'desconhecida']; // Exemplo de tags

            try {
                await salvarMemoria({
                    usuarioId,
                    mensagemId,
                    resumoEco: resumoEco,
                    dataRegistro,
                    contexto: contextoMensagem,
                    emocaoPrincipal,
                    intensidade: intensidadeEmocao,
                    tags: tagsExemplo,
                });
                setMensagemDeSucesso('Memória registrada com sucesso.');
                setTimeout(() => setMensagemDeSucesso(null), 3000);
            } catch (error: any) {
                console.error("Erro ao salvar memória manualmente:", error);
                // Adicione tratamento de erro para o usuário
            }
        } else {
            alert('Nenhuma mensagem da Eco para registrar.');
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
                const usuarioId = 'USUARIO_ID_SIMULADO';
                const mensagemId = Date.now().toString();
                await salvarMemoria({ usuarioId, mensagemId, resumoEco: mensagemASalvar });
                setMensagemDeSucesso('Memória registrada com sucesso!');
                setTimeout(() => {
                    setMensagemDeSucesso(null);
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
                <ChatInput
                    onSendMessage={lidarComEnvioDeMensagem}
                    onRegistroManual={handleRegistroManual} // Passa a função correta
                />
            </div>
            {isMemoryHistoryOpen && (
                <TelaDeHistoricoDeMemorias onClose={() => setIsMemoryHistoryOpen(false)} />
            )}
        </PhoneFrame>
    );
};

export default PaginaDeConversa;