import {
  Inviter,
  Invitation,
  Registerer,
  SessionState,
  UserAgent,
  Web
} from "sip.js";
import { databases } from "./appwrite";
import { Query } from "appwrite";

const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || 'default';

export interface SipConfig {
  sip_server: string;
  sip_port: number; // porta WSS, não porta SIP
  sip_username: string;
  sip_password: string;
  sip_extension: string;
  is_active: boolean;
}

export class SipClient {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Inviter | Invitation | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private onIncomingCallCallback: ((callerNumber: string, invitation: Invitation) => void) | null = null;

  async initialize(): Promise<boolean> {
    try {
      if (this.isConnected()) {
        console.log("SIP já está inicializado");
        return true;
      }

      const { documents } = await databases.listDocuments(
        DATABASE_ID,
        'sip_config',
        [Query.equal('is_active', true), Query.limit(1)]
      );
      const config = documents.length > 0 ? (documents[0] as unknown as SipConfig & { id?: string }) : null;

      if (!config) {
        console.log("Nenhuma configuração SIP ativa encontrada");
        return false;
      }

      if (!config.sip_server || !config.sip_username || !config.sip_password) {
        console.log("Configuração SIP incompleta");
        return false;
      }

      const wsServer = `wss://${config.sip_server}:${config.sip_port || 7443}/ws`;

      const uri = UserAgent.makeURI(
        `sip:${config.sip_username}@${config.sip_server}`
      );

      if (!uri) {
        console.error("Erro ao criar URI SIP");
        return false;
      }

      this.userAgent = new UserAgent({
        uri,
        authorizationUsername: config.sip_username,
        authorizationPassword: config.sip_password,

        transportOptions: {
          server: wsServer,
          connectionTimeout: 10,
          keepAliveInterval: 30,
        },

        sessionDescriptionHandlerFactoryOptions: {
          constraints: {
            audio: true,
            video: false,
          },
          peerConnectionConfiguration: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" }
            ]
          }
        },

        delegate: {
          onInvite: (invitation) => this.handleIncomingCall(invitation),
          onDisconnect: (error) => {
            console.error("SIP desconectado:", error);
          },
        },
      });

      await Promise.race([
        this.userAgent.start(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao conectar ao servidor SIP")), 15000)
        )
      ]);

      this.registerer = new Registerer(this.userAgent);

      await Promise.race([
        this.registerer.register(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao registrar no servidor SIP")), 15000)
        )
      ]);

      this.setupAudioElement();

      console.log("📞 SIP Registrado com sucesso!");
      return true;

    } catch (error) {
      console.error("Erro ao iniciar SIP:", error);
      if (this.userAgent) {
        try {
          await this.userAgent.stop();
        } catch (e) {
          console.error("Erro ao parar UserAgent:", e);
        }
        this.userAgent = null;
      }
      return false;
    }
  }

  private setupAudioElement() {
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
  }

  setOnIncomingCall(callback: (callerNumber: string, invitation: Invitation) => void) {
    this.onIncomingCallCallback = callback;
  }

  private handleIncomingCall(invitation: Invitation) {
    this.session = invitation;

    const callerUri = invitation.remoteIdentity.uri.toString();
    const callerNumber = callerUri.split('@')[0].replace('sip:', '');

    console.log("📲 Chamada recebida de:", callerNumber);

    if (this.onIncomingCallCallback) {
      this.onIncomingCallCallback(callerNumber, invitation);
    }

    invitation.stateChange.addListener((state) => {
      console.log("📲 Estado da chamada recebida:", state);

      if (state === SessionState.Established) {
        this.setupRemoteAudio(invitation);
      }
    });
  }

  async makeCall(phoneNumber: string): Promise<boolean> {
    if (!this.userAgent) {
      console.error("SIP não inicializado");
      return false;
    }

    const { documents } = await databases.listDocuments(
      DATABASE_ID,
      'sip_config',
      [Query.equal('is_active', true), Query.limit(1)]
    );
    const config = documents.length > 0 ? (documents[0] as unknown as SipConfig & { id?: string }) : null;
    if (!config) return false;

    const target = UserAgent.makeURI(
      `sip:${phoneNumber}@${config.sip_server}`
    );

    if (!target) {
      console.error("URI de destino inválida");
      return false;
    }

    try {
      const inviter = new Inviter(this.userAgent, target, {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false }
        }
      });

      this.session = inviter;

      inviter.stateChange.addListener((state) => {
        console.log("📞 Estado da chamada:", state);

        if (state === SessionState.Established) {
          this.setupRemoteAudio(inviter);
        }
      });

      await inviter.invite();
      return true;

    } catch (error) {
      console.error("Erro ao fazer ligação:", error);
      return false;
    }
  }

  private setupRemoteAudio(session: Inviter | Invitation) {
    const sdh = session.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    if (!sdh) return;

    const remoteStream = sdh.remoteMediaStream;

    if (this.remoteAudio && remoteStream) {
      this.remoteAudio.srcObject = remoteStream;
      this.remoteAudio.play().catch(console.error);
    }
  }

  async hangup(): Promise<void> {
    if (!this.session) return;

    try {
      if (this.session instanceof Inviter) {
        await this.session.cancel();
      } else {
        await this.session.reject();
      }
    } catch (error) {
      console.error("Erro ao desligar:", error);
    } finally {
      this.session = null;
    }
  }

  async answer(): Promise<void> {
    if (!(this.session instanceof Invitation)) return;

    try {
      await this.session.accept();
      this.setupRemoteAudio(this.session);
    } catch (error) {
      console.error("Erro ao atender:", error);
    }
  }

  async reject(): Promise<void> {
    if (!(this.session instanceof Invitation)) return;

    try {
      await this.session.reject();
      this.session = null;
    } catch (error) {
      console.error("Erro ao rejeitar:", error);
    }
  }

  async mute(muted: boolean): Promise<void> {
    const sdh = this.session?.sessionDescriptionHandler as Web.SessionDescriptionHandler;
    const stream = sdh?.localMediaStream;

    stream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  async setVolume(volume: number): Promise<void> {
    if (this.remoteAudio) this.remoteAudio.volume = volume;
  }

  async disconnect(): Promise<void> {
    await this.hangup();

    await this.registerer?.unregister();
    this.registerer = null;

    await this.userAgent?.stop();
    this.userAgent = null;

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
  }

  isConnected(): boolean {
    return !!this.userAgent && !!this.registerer;
  }

  getCallState(): SessionState | null {
    return this.session?.state || null;
  }
}

export const sipClient = new SipClient();
