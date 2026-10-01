import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, X, Move, Delete } from 'lucide-react';
import { databases } from '../lib/appwrite';
import { ID } from 'appwrite';
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'crm_db';
import { sipClient } from '../lib/sipClient';
import { useAuth } from '../context/AuthContext';

interface CallModalProps {
  isOpen: boolean;
  contactName?: string;
  phoneNumber?: string;
  isIncoming?: boolean;
  onClose: () => void;
  onCallEnd?: (duration: number) => void;
}

type CallStatus = 'connecting' | 'ringing' | 'answered' | 'ended' | 'incoming';

export default function CallModal({
  isOpen,
  contactName = '',
  phoneNumber = '',
  isIncoming = false,
  onClose,
  onCallEnd,
}: CallModalProps) {
  const { user } = useAuth();
  const [callStatus, setCallStatus] = useState<CallStatus>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [sipConnected, setSipConnected] = useState(false);
  const [keypadInput, setKeypadInput] = useState('');
  const [manualPhoneNumber, setManualPhoneNumber] = useState(phoneNumber);
  const [isManualDialing, setIsManualDialing] = useState(false);
  const [callRecordId, setCallRecordId] = useState<string | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);

  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const FIXED_WIDTH = 400;
  const MAX_HEIGHT = 780;

  useEffect(() => {
    if (!isOpen) {
      setCallStatus('connecting');
      setCallDuration(0);
      setKeypadInput('');
      setSipConnected(false);
      setManualPhoneNumber('');
      setIsManualDialing(false);
      setCallRecordId(null);
      callStartTimeRef.current = null;
      return;
    }

    if (isIncoming) {
      setCallStatus('incoming');
      setSipConnected(true);
      setManualPhoneNumber(phoneNumber);
      createCallRecord(phoneNumber, contactName || 'Desconhecido', 'inbound');
    } else if (!phoneNumber || phoneNumber === '') {
      setIsManualDialing(true);
    } else {
      setIsManualDialing(false);
      setManualPhoneNumber(phoneNumber);
      initializeSipAndCall();
    }
  }, [isOpen]);

  const createCallRecord = async (targetNumber: string, targetName: string, direction: 'inbound' | 'outbound' = 'outbound') => {
    try {
      callStartTimeRef.current = new Date();

      const { data, error } = await supabase
        .from('call_history')
        .insert({
          caller_id: user?.id || null,
          contact_type: targetNumber ? 'external' : 'internal',
          contact_id: targetName,
          contact_name: targetName,
          phone_number: targetNumber,
          direction,
          status: direction === 'inbound' ? 'incoming' : 'ringing',
          duration: 0,
          started_at: callStartTimeRef.current.toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating call record:', error);
        return null;
      }

      setCallRecordId(data.id);
      return data.id;
    } catch (error) {
      console.error('Error creating call record:', error);
      return null;
    }
  };

  const updateCallStatus = async (status: 'ringing' | 'answered' | 'ended' | 'missed' | 'failed', duration?: number) => {
    if (!callRecordId) return;

    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'ended' && duration !== undefined) {
        updateData.duration = duration;
        updateData.ended_at = new Date().toISOString();
      } else if (status === 'answered') {
        updateData.duration = 0;
      }

      await databases.updateDocument(DATABASE_ID, 'call_history', callRecordId, updateData);
    } catch (error) {
      console.error('Error updating call status:', error);
    }
  };

  const initializeSipAndCall = async (numberToCall?: string) => {
    setCallStatus('connecting');

    if (!sipClient.isConnected()) {
      const confirmRetry = confirm(
        'Servidor SIP não está conectado.\n\n' +
        'Possíveis causas:\n' +
        '• Servidor SIP offline ou inacessível\n' +
        '• Problemas de rede ou firewall\n' +
        '• Certificado SSL/TLS inválido\n' +
        '• Configurações SIP incorretas\n\n' +
        'Verifique as configurações em "Configurações > DS Voice" ou contate o administrador do sistema.'
      );

      if (confirmRetry) {
        console.log('Usuário notificado sobre problema SIP');
      }
      onClose();
      return;
    }

    setSipConnected(true);
    setCallStatus('ringing');

    const targetNumber = numberToCall || manualPhoneNumber || phoneNumber;
    const targetName = contactName || 'Desconhecido';

    if (targetNumber && targetNumber !== '') {
      const recordId = await createCallRecord(targetNumber, targetName);

      const callStarted = await sipClient.makeCall(targetNumber);

      if (!callStarted) {
        if (recordId) {
          await updateCallStatus('failed');
        }
        alert('Erro ao iniciar chamada. Verifique o número e tente novamente.');
        onClose();
        return;
      }

      const checkCallState = setInterval(() => {
        const state = sipClient.getCallState();

        if (state === 'Established') {
          setCallStatus('answered');
          updateCallStatus('answered');
          clearInterval(checkCallState);
        } else if (state === 'Terminated') {
          handleEndCall();
          clearInterval(checkCallState);
        }
      }, 500);

      return () => clearInterval(checkCallState);
    }
  };

  useEffect(() => {
    if (callStatus !== 'answered') return;

    const interval = setInterval(() => {
      setCallDuration((prev) => {
        const newDuration = prev + 1;

        if (newDuration % 5 === 0 && callRecordId) {
          supabase
            .from('call_history')
            .update({
              duration: newDuration,
              updated_at: new Date().toISOString()
            })
            .eq('id', callRecordId)
            .then()
            .catch(console.error);
        }

        return newDuration;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [callStatus, callRecordId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        const modalHeight = modalRef.current?.offsetHeight || MAX_HEIGHT;
        const maxX = window.innerWidth - FIXED_WIDTH - 20;
        const maxY = window.innerHeight - modalHeight - 20;

        setPosition({
          x: Math.max(20, Math.min(newX, maxX)),
          y: Math.max(20, Math.min(newY, maxY)),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!modalRef.current) return;

    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };


  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEndCall = async () => {
    await sipClient.hangup();
    setCallStatus('ended');

    const finalStatus = callDuration > 0 ? 'ended' : 'missed';

    if (callRecordId) {
      await updateCallStatus(finalStatus, callDuration);
    } else {
      const finalNumber = manualPhoneNumber || phoneNumber;
      const finalName = contactName || 'Desconhecido';

      try {
        await databases.createDocument(DATABASE_ID, 'call_history', ID.unique(), {
          caller_id: user?.id || null,
          contact_type: finalNumber ? 'external' : 'internal',
          contact_id: finalName,
          contact_name: finalName,
          phone_number: finalNumber,
          direction: 'outbound',
          status: finalStatus,
          duration: callDuration,
          started_at: new Date(Date.now() - callDuration * 1000).toISOString(),
          ended_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error saving call history:', error);
      }
    }

    if (onCallEnd) {
      onCallEnd(callDuration);
    }

    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleMuteToggle = async () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    await sipClient.mute(newMutedState);
  };

  const handleSpeakerToggle = async () => {
    const newSpeakerState = !isSpeakerOn;
    setIsSpeakerOn(newSpeakerState);
    await sipClient.setVolume(newSpeakerState ? 1 : 0);
  };

  const handleKeypadPress = (key: string) => {
    if (isManualDialing) {
      setManualPhoneNumber((prev) => prev + key);
    } else {
      setKeypadInput((prev) => prev + key);
    }
  };

  const handleKeypadDelete = () => {
    if (isManualDialing) {
      setManualPhoneNumber((prev) => prev.slice(0, -1));
    }
  };

  const handleAnswerCall = async () => {
    await sipClient.answer();
    setCallStatus('answered');
    if (callRecordId) {
      await updateCallStatus('answered');
    }
  };

  const handleRejectCall = async () => {
    await sipClient.reject();
    setCallStatus('ended');
    if (callRecordId) {
      await updateCallStatus('missed');
    }
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  if (!isOpen) return null;

  const getStatusText = () => {
    switch (callStatus) {
      case 'connecting':
        return 'Conectando...';
      case 'ringing':
        return 'Chamando...';
      case 'incoming':
        return 'Chamada Recebida';
      case 'answered':
        return formatDuration(callDuration);
      case 'ended':
        return 'Chamada Encerrada';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (callStatus) {
      case 'connecting':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'ringing':
        return 'text-blue-600 dark:text-blue-400';
      case 'incoming':
        return 'text-green-600 dark:text-green-400 animate-pulse';
      case 'answered':
        return 'text-green-600 dark:text-green-400';
      case 'ended':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return '';
    }
  };

  const keypadButtons = [
    { key: '1', sub: '' },
    { key: '2', sub: 'ABC' },
    { key: '3', sub: 'DEF' },
    { key: '4', sub: 'GHI' },
    { key: '5', sub: 'JKL' },
    { key: '6', sub: 'MNO' },
    { key: '7', sub: 'PQRS' },
    { key: '8', sub: 'TUV' },
    { key: '9', sub: 'WXYZ' },
    { key: '*', sub: '' },
    { key: '0', sub: '+' },
    { key: '#', sub: '' },
  ];

  return (
    <>
      <style>
        {`
          .call-modal-content::-webkit-scrollbar {
            width: 6px;
          }
          .call-modal-content::-webkit-scrollbar-track {
            background: transparent;
          }
          .call-modal-content::-webkit-scrollbar-thumb {
            background: rgba(156, 163, 175, 0.3);
            border-radius: 3px;
          }
          .call-modal-content::-webkit-scrollbar-thumb:hover {
            background: rgba(156, 163, 175, 0.5);
          }
        `}
      </style>
      <div
        ref={modalRef}
        className="fixed bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl shadow-2xl border border-gray-700/50 z-50 flex flex-col"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${FIXED_WIDTH}px`,
          maxHeight: `calc(100vh - 40px)`,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
      <div className="relative flex-1 flex flex-col min-h-0">
        <div
          className="flex items-center justify-between p-4 cursor-grab active:cursor-grabbing border-b border-gray-700/50 flex-shrink-0"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2 flex-1">
            <Move className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Chamada em Andamento</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full transition-all duration-200 z-10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div
          className="call-modal-content flex-1 flex flex-col overflow-y-auto overflow-x-hidden px-3 py-2"
          style={{ minHeight: 0 }}
        >
          <div className="flex flex-col items-center flex-shrink-0 mb-2">
            <div className="relative mb-1.5">
              <div
                className={`w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-600/20 ${
                  callStatus === 'ringing' ? 'animate-pulse' : ''
                }`}
              >
                <Phone className="w-7 h-7" />
              </div>
              {sipConnected && callStatus !== 'ended' && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 bg-gray-800 rounded-full border border-gray-700">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-medium text-gray-300">
                    Conectado
                  </span>
                </div>
              )}
            </div>

            {isManualDialing && callStatus === 'connecting' ? (
              <>
                <h2 className="text-sm font-bold text-white mb-1.5 text-center">
                  Nova Chamada
                </h2>
                <div className="w-full max-w-[280px] mb-1.5">
                  <input
                    type="tel"
                    value={manualPhoneNumber}
                    onChange={(e) => setManualPhoneNumber(e.target.value)}
                    placeholder="Digite o número"
                    className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-xl text-white text-center text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
                    readOnly
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-white mb-0.5 text-center">
                  {contactName || 'Chamada'}
                </h2>

                {(manualPhoneNumber || phoneNumber) && (
                  <p className="text-[11px] text-gray-400 mb-0.5 font-medium">
                    {manualPhoneNumber || phoneNumber}
                  </p>
                )}
              </>
            )}

            {!isManualDialing && (
              <p className={`text-sm font-semibold ${getStatusColor()}`}>
                {getStatusText()}
              </p>
            )}
          </div>

          {isManualDialing && callStatus === 'connecting' && (
            <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden" style={{ minHeight: 0 }}>
              <div className="bg-gray-800/50 rounded-xl p-1.5 mb-2 flex-shrink-0">
                <div className="grid grid-cols-3 gap-1.5">
                  {keypadButtons.map((btn) => (
                    <button
                      key={btn.key}
                      onClick={() => handleKeypadPress(btn.key)}
                      className="h-16 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center group"
                    >
                      <span className="text-xl font-semibold text-white group-hover:scale-110 transition-transform">
                        {btn.key}
                      </span>
                      {btn.sub && (
                        <span className="text-[8px] text-gray-400 font-medium mt-0.5">
                          {btn.sub}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mb-2 flex-shrink-0">
                <button
                  onClick={handleKeypadDelete}
                  className="flex-1 py-2 px-4 bg-gray-700/50 hover:bg-gray-600/50 text-white text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Delete className="w-4 h-4" />
                  Apagar
                </button>
              </div>

              <button
                onClick={() => {
                  if (manualPhoneNumber.trim()) {
                    setIsManualDialing(false);
                    initializeSipAndCall(manualPhoneNumber);
                  } else {
                    alert('Digite um número de telefone');
                  }
                }}
                disabled={!manualPhoneNumber.trim()}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-sm rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Phone className="w-5 h-5" />
                Ligar
              </button>
            </div>
          )}

           {!isManualDialing && callStatus === 'answered' && (
             <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
               <div className="bg-gray-800/50 rounded-xl p-1 mb-2 flex-shrink-0">
   <div className="grid grid-cols-3 gap-1">
     {keypadButtons.map((btn) => (
       <button
         key={btn.key}
         onClick={() => handleKeypadPress(btn.key)}
         className="aspect-[6/5] rounded-lg bg-gray-700/50 hover:bg-gray-600/50 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center group"
       >
                       <span className="text-sm font-semibold text-white group-hover:scale-110 transition-transform">
                         {btn.key}
                       </span>
                       {btn.sub && (
                         <span className="text-[8px] text-gray-400 font-medium mt-0.5">
                           {btn.sub}
                         </span>
                       )}
                     </button>
                   ))}
                 </div>
               </div>

               <div className="flex justify-center gap-1.5 mb-2 flex-shrink-0">
                 <button
                   onClick={handleMuteToggle}
                   className={`p-2 rounded-lg transition-all duration-200 flex-1 ${
                     isMuted
                       ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                       : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                   }`}
                   title={isMuted ? 'Ativar microfone' : 'Desativar microfone'}
                 >
                   {isMuted ? <MicOff className="w-4 h-4 mx-auto" /> : <Mic className="w-4 h-4 mx-auto" />}
                 </button>

                 <button
                   onClick={handleSpeakerToggle}
                   className={`p-2 rounded-lg transition-all duration-200 flex-1 ${
                     isSpeakerOn
                       ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                       : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                   }`}
                   title={isSpeakerOn ? 'Desativar alto-falante' : 'Ativar alto-falante'}
                 >
                   {isSpeakerOn ? <Volume2 className="w-4 h-4 mx-auto" /> : <VolumeX className="w-4 h-4 mx-auto" />}
                 </button>
               </div>
             </div>
           )}

           {callStatus === 'incoming' && (
             <div className="flex gap-2 flex-shrink-0">
               <button
                 onClick={handleRejectCall}
                 className="flex-1 py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 active:scale-98"
               >
                 <PhoneOff className="w-4 h-4" />
                 Rejeitar
               </button>
               <button
                 onClick={handleAnswerCall}
                 className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-sm rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-98 animate-pulse"
               >
                 <Phone className="w-4 h-4" />
                 Atender
               </button>
             </div>
          )}

          {!isManualDialing && callStatus !== 'ended' && callStatus !== 'incoming' && (
            <button
              onClick={handleEndCall}
              disabled={callStatus === 'connecting'}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20 active:scale-98 flex-shrink-0"
            >
              <PhoneOff className="w-4 h-4" />
              Encerrar Chamada
            </button>
          )}

          {callStatus === 'ended' && (
            <div className="text-center flex-1 flex flex-col justify-center gap-2">
              <div className="bg-gray-800/50 rounded-xl p-2.5">
                <p className="text-[11px] text-gray-400 mb-0.5">
                  Duração da chamada
                </p>
                <p className="text-lg font-bold text-white">
                  {formatDuration(callDuration)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-gray-700 text-white text-sm rounded-xl hover:bg-gray-600 transition-all duration-200 font-medium"
              >
                Fechar
              </button>
            </div>
          )}
        </div>

        <div className="bg-gray-800/50 border-t border-gray-700/50 px-3 py-1.5 flex-shrink-0">
          <div className="flex items-center justify-center gap-2 text-[9px] text-gray-400">
            <Phone className="w-2.5 h-2.5" />
            <span className="font-medium">Chamada via SIP Voice</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
