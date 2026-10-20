import type {
  Activity,
  AgendaEvent,
  Charge,
  Client,
  Database,
  DocumentRecord,
  Invoice,
  Server,
  Service,
  Ticket,
  TicketStatus,
  User,
} from '../types';
import { localDateTime } from '../utils/format';
import { demoDocument } from '../utils/validation';

export const DATABASE_VERSION = 1;

/** Entirely invented demonstration records. No external service is queried. */
export function createSeed(now = new Date()): Database {
  const base = localDateTime(now).slice(0, 10);
  const relativeDate = (offset: number): string => {
    const value = new Date(`${base}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  };
  const relativeTime = (offset: number, hour = 9, minute = 0): string =>
    new Date(
      `${relativeDate(offset)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`,
    ).toISOString();
  const users: User[] = [
    {
      id: 'user-admin',
      name: 'Amanda Torres',
      email: 'amanda@central.example',
      role: 'admin',
      active: true,
    },
    {
      id: 'user-support-1',
      name: 'Lucas Rocha',
      email: 'lucas@central.example',
      role: 'support',
      active: true,
    },
    {
      id: 'user-support-2',
      name: 'Rafael Nunes',
      email: 'rafael@central.example',
      role: 'support',
      active: true,
    },
    {
      id: 'user-finance',
      name: 'Camila Duarte',
      email: 'camila@central.example',
      role: 'finance',
      active: true,
    },
    {
      id: 'user-client',
      name: 'Mariana Alves',
      email: 'mariana@cliente.example',
      role: 'client',
      active: true,
    },
    {
      id: 'user-support-3',
      name: 'Beatriz Costa',
      email: 'beatriz@central.example',
      role: 'support',
      active: true,
    },
  ];
  const clientDefinitions = [
    [
      'Aurora Comércio',
      'Aurora Comércio e Distribuição Ltda.',
      'Campinas',
      'SP',
      'Mariana Alves',
      'Comércio',
    ],
    [
      'Clínica Horizonte',
      'Horizonte Clínica Integrada Ltda.',
      'Indaiatuba',
      'SP',
      'Renato Azevedo',
      'Saúde',
    ],
    [
      'Condomínio Villa Clara',
      'Condomínio Residencial Villa Clara',
      'Itu',
      'SP',
      'Patrícia Mello',
      'Condomínio',
    ],
    [
      'Nexo Logística',
      'Nexo Transportes e Logística Ltda.',
      'Jundiaí',
      'SP',
      'Daniel Ribeiro',
      'Logística',
    ],
    [
      'Instituto Aprender',
      'Aprender Educação e Cultura Ltda.',
      'Sorocaba',
      'SP',
      'Fernanda Pires',
      'Educação',
    ],
    [
      'Lumina Engenharia',
      'Lumina Projetos e Engenharia Ltda.',
      'São Paulo',
      'SP',
      'Eduardo Lessa',
      'Engenharia',
    ],
    ['Mercado Boa Praça', 'Boa Praça Alimentos Ltda.', 'Salto', 'SP', 'Carolina Maia', 'Varejo'],
    [
      'Studio Ipê',
      'Ipê Arquitetura e Design Ltda.',
      'Atibaia',
      'SP',
      'Thiago Valente',
      'Arquitetura',
    ],
    [
      'Vértice Consultoria',
      'Vértice Gestão Empresarial Ltda.',
      'Campinas',
      'SP',
      'Helena Prado',
      'Consultoria',
    ],
    [
      'Oficina Rota Nova',
      'Rota Nova Serviços Automotivos Ltda.',
      'Itatiba',
      'SP',
      'Marcelo Neves',
      'Serviços',
    ],
    [
      'Parque das Águas',
      'Condomínio Empresarial Parque das Águas',
      'Valinhos',
      'SP',
      'Isabela Faria',
      'Condomínio',
    ],
    [
      'Alva Tecnologia',
      'Alva Soluções Digitais Ltda.',
      'Ribeirão Preto',
      'SP',
      'Bruno Teixeira',
      'Tecnologia',
    ],
    [
      'Café Jardim',
      'Jardim Cafeteria e Alimentos Ltda.',
      'Piracicaba',
      'SP',
      'Juliana Campos',
      'Alimentação',
    ],
    [
      'Lume Distribuidora',
      'Lume Distribuição Comercial Ltda.',
      'Belo Horizonte',
      'MG',
      'André Monteiro',
      'Distribuição',
    ],
    [
      'Espaço Viver',
      'Espaço Viver Saúde e Bem Estar Ltda.',
      'Curitiba',
      'PR',
      'Sofia Amaral',
      'Saúde',
    ],
    [
      'Fábrica Arvoredo',
      'Arvoredo Móveis e Decoração Ltda.',
      'Joinville',
      'SC',
      'Caio Fernandes',
      'Indústria',
    ],
    [
      'Estação Criativa',
      'Estação Comunicação e Eventos Ltda.',
      'Santos',
      'SP',
      'Larissa Matos',
      'Comunicação',
    ],
    [
      'Vale Azul Turismo',
      'Vale Azul Viagens e Turismo Ltda.',
      'São José dos Campos',
      'SP',
      'Vinícius Tavares',
      'Turismo',
    ],
    ['Clara Moreira', 'Clara Moreira', 'Limeira', 'SP', 'Clara Moreira', 'Profissional autônomo'],
    ['Pedro Sampaio', 'Pedro Sampaio', 'Americana', 'SP', 'Pedro Sampaio', 'Profissional autônomo'],
  ];
  const clients: Client[] = clientDefinitions.map((definition, index) => {
    const [tradeName, name, city, state, contactName, segment] = definition;
    const personType = index >= 18 ? 'PF' : 'PJ';
    const documentBase =
      personType === 'PJ'
        ? `${String(72145000 + index * 173).padStart(8, '0')}0001`
        : String(681432100 + index * 139);
    const id = `client-${String(index + 1).padStart(2, '0')}`;
    return {
      id,
      personType,
      name,
      tradeName,
      document: demoDocument(documentBase, personType),
      cep: `130${String(10 + index).padStart(2, '0')}-000`,
      address: [
        'Rua dos Jacarandás',
        'Avenida das Palmeiras',
        'Rua das Acácias',
        'Avenida Horizonte',
      ][index % 4],
      number: String(120 + index * 14),
      complement: index % 3 === 0 ? `Sala ${index + 1}` : '',
      neighborhood: ['Centro', 'Jardim Primavera', 'Vila Nova'][index % 3],
      city,
      state,
      phone: `(19) 3000-${String(1000 + index).padStart(4, '0')}`,
      email: `contato${index + 1}@cliente.example`,
      status: index >= 18 ? 'Inativo' : 'Ativo',
      notes: `Cliente fictício do segmento ${segment.toLowerCase()}. Cadastro de demonstração para explorar a central de operações.`,
      createdAt: relativeTime(-180 + index * 7, 10),
      contacts: [
        {
          id: `contact-${index + 1}`,
          name: contactName,
          role: personType === 'PJ' ? 'Responsável administrativo' : 'Titular',
          phone: `(19) 99000-${String(1100 + index)}`,
          email: `responsavel${index + 1}@cliente.example`,
          primary: true,
        },
        ...(index < 6
          ? [
              {
                id: `contact-${index + 1}-2`,
                name: [
                  'Gustavo Ramos',
                  'Márcia Vidal',
                  'Aline Rocha',
                  'Roberto Dias',
                  'Paula Rezende',
                  'Igor Viana',
                ][index],
                role: 'Contato técnico',
                phone: `(19) 99001-${String(1200 + index)}`,
                email: `tecnico${index + 1}@cliente.example`,
                primary: false,
              },
            ]
          : []),
      ],
    };
  });
  const serverDefinitions: [string, Server['type'], string, Server['status']][] = [
    ['PABX Cloud • São Paulo', 'PABX', 'Yeastar P-Series', 'Disponível'],
    ['PABX Cloud • Campinas', 'PABX', 'Yeastar P-Series', 'Em atenção'],
    ['SIP Core • Principal', 'Telefonia', 'MagnusBilling', 'Disponível'],
    ['PABX Cloud • Interior', 'PABX', 'FusionPBX', 'Disponível'],
    ['SIP Core • Contingência', 'Telefonia', 'FreeSWITCH', 'Indisponível'],
    ['Portal de Atendimento', 'Aplicação', 'Node.js', 'Disponível'],
    ['PABX Dedicado • Villa Clara', 'PABX', 'Yeastar P-Series', 'Disponível'],
    ['Laboratório de Homologação', 'Outro', 'Ambiente de testes', 'Sem dados'],
  ];
  const servers: Server[] = serverDefinitions.map(([name, type, platform, status], index) => ({
    id: `server-${String(index + 1).padStart(2, '0')}`,
    name,
    type,
    platform,
    domain: `servidor-${index + 1}.central.example`,
    port: 443,
    environment: index === 7 ? 'Homologação' : 'Produção (demo)',
    clientIds: [],
    status,
    lastCheck:
      index === 7 ? relativeTime(-3) : new Date(now.getTime() - (index + 1) * 60000).toISOString(),
    registeredExtensions: [248, 126, 0, 87, 0, 0, 52, 0][index],
    unavailableExtensions: [0, 8, 0, 0, 12, 0, 0, 0][index],
    uptime: [99.98, 99.42, 99.99, 99.95, 97.86, 100, 99.97, 0][index],
    notes:
      'Dados simulados. Endereço reservado para demonstração; a central não realiza consultas de rede.',
    incidents:
      index === 1
        ? [
            {
              id: 'incident-01',
              title: 'Ramais com registro intermitente',
              date: relativeTime(0, 8, 35),
              status: 'Aberto',
            },
          ]
        : index === 4
          ? [
              {
                id: 'incident-02',
                title: 'Indisponibilidade no ambiente de contingência',
                date: relativeTime(0, 7, 48),
                status: 'Aberto',
              },
            ]
          : index === 0
            ? [
                {
                  id: 'incident-03',
                  title: 'Manutenção programada concluída',
                  date: relativeTime(-7, 23),
                  status: 'Resolvido',
                },
              ]
            : [],
  }));
  const serviceNames = [
    'PABX Cloud Empresarial',
    'Linha Fixa Ilimitada',
    'SIP Trunk Corporativo',
    'Licença Ramal Plus',
    'Interfonia Cloud',
  ];
  const serviceTypes = ['PABX em nuvem', 'Telefonia fixa', 'SIP Trunk', 'Ramal', 'Interfonia'];
  const services: Service[] = clients.map((client, index) => ({
    id: `service-${String(index + 1).padStart(2, '0')}`,
    clientId: client.id,
    name: serviceNames[index % 5],
    type: serviceTypes[index % 5],
    serverId:
      index === 2
        ? 'server-07'
        : servers[[0, 1, 3, 0, 2, 3, 1, 0, 3, 2, 0, 1, 3, 0, 1, 3, 2, 0, 3, 1][index]].id,
    status: client.status === 'Inativo' ? 'Cancelado' : index === 13 ? 'Suspenso' : 'Ativo',
    extensions: [12, 20, 52, 8, 15, 6, 4, 10, 7, 3][index % 10],
    channels: [5, 8, 10, 3, 5][index % 5],
    monthlyValue: [299.9, 499.9, 1299.9, 199.9, 349.9, 159.9, 99.9, 249.9, 189.9, 89.9][index % 10],
    notes: 'Serviço fictício para navegação e testes de associação.',
  }));
  for (let index = 0; index < 6; index++)
    services.push({
      id: `service-extra-${index + 1}`,
      clientId: clients[index].id,
      name: 'Linha adicional • 2 canais',
      type: 'Telefonia fixa',
      serverId: 'server-03',
      status: 'Ativo',
      extensions: 0,
      channels: 2,
      monthlyValue: 49.9,
      notes: 'Adicional de demonstração.',
    });
  for (const server of servers)
    server.clientIds = [
      ...new Set(
        services
          .filter((service) => service.serverId === server.id && service.status !== 'Cancelado')
          .map((service) => service.clientId),
      ),
    ];

  const ticketTitles = [
    'Ramais com registro intermitente',
    'Ajustar horário da URA',
    'Atualizar contato do condomínio',
    'Áudio unilateral em chamadas externas',
    'Criar novos ramais administrativos',
    'Revisar mensagem de boas-vindas',
    'Solicitação de relatório mensal',
    'Portabilidade de linha adicional',
    'Acesso ao portal do cliente',
    'Instalação de aparelho IP',
    'Revisão de grupos de atendimento',
    'Alteração de nome de ramal',
    'Ligações com ruído na recepção',
    'Atualizar dados de cobrança',
    'Validação do plano de discagem',
    'Configurar desvio fora do expediente',
    'Orientação de uso do aplicativo',
    'Revisar gravações do atendimento',
    'Cancelar serviço adicional',
    'Conferência cadastral',
    'Fila de atendimento sem transbordo',
    'Novos aparelhos para a equipe',
    'Integração da interfonia',
    'Revisar permissões de acesso',
    'Alteração de responsável técnico',
    'Reconfigurar tecla de transferência',
    'Falha no encaminhamento externo',
    'Solicitação de segunda via',
    'Ajustar anúncio de feriado',
    'Encerramento de atendimento',
  ];
  const ticketStatuses: TicketStatus[] = [
    'Em andamento',
    'Novo',
    'Aguardando retorno',
    'Em andamento',
    'Novo',
    'Resolvido',
    'Aguardando retorno',
    'Em andamento',
    'Resolvido',
    'Novo',
    'Em andamento',
    'Resolvido',
    'Em andamento',
    'Aguardando retorno',
    'Resolvido',
    'Novo',
    'Resolvido',
    'Aguardando retorno',
    'Cancelado',
    'Resolvido',
    'Em andamento',
    'Novo',
    'Em andamento',
    'Resolvido',
    'Resolvido',
    'Aguardando retorno',
    'Novo',
    'Resolvido',
    'Novo',
    'Cancelado',
  ];
  const categories = [
    'Telefonia',
    'PABX e ramais',
    'Configuração',
    'Portabilidade',
    'Financeiro',
    'Solicitação geral',
  ];
  const tickets: Ticket[] = ticketTitles.map((title, index) => {
    const client = clients[index % clients.length];
    const status = ticketStatuses[index];
    const ageDays = Math.max(1, 12 - Math.floor(index / 3));
    const createdAt = relativeTime(-ageDays, 8 + (index % 8), index % 2 ? 15 : 40);
    const updatedAt = new Date(
      now.getTime() - Math.min(index % 4, ageDays - 1) * 86400000 - (25 + index * 3) * 60000,
    ).toISOString();
    const id = `ticket-${String(index + 1).padStart(2, '0')}`;
    const assignee = users[[1, 2, 5][index % 3]];
    const publicMessage = {
      id: `${id}-message-1`,
      text: [
        'Recebemos a solicitação e estamos verificando o cenário. Retornaremos com a atualização por aqui.',
        'A configuração foi revisada. Você pode realizar um novo teste e nos confirmar o resultado?',
        'Para continuar, poderia informar o ramal e o horário aproximado da ocorrência?',
      ][index % 3],
      author: assignee.name,
      internal: false,
      createdAt: new Date(new Date(updatedAt).getTime() - 15 * 60000).toISOString(),
    };
    return {
      id,
      number: 1041 + index,
      title,
      description: `Solicitação de ${client.tradeName}: ${title.toLowerCase()}. Este é um atendimento fictício. Registre mensagens, acompanhe o histórico e simule as etapas de resolução.`,
      clientId: client.id,
      category: categories[index === 13 || index === 27 ? 4 : index % 4],
      priority:
        index === 0 || index === 3 || index === 26
          ? 'Crítica'
          : index % 4 === 0 || index === 12
            ? 'Alta'
            : index % 3 === 0
              ? 'Baixa'
              : 'Média',
      status,
      assigneeId: status === 'Novo' && index % 2 === 0 ? '' : assignee.id,
      createdAt,
      updatedAt,
      dueAt: relativeTime(
        index === 0 || index === 3 || index === 12 || index === 20 ? -1 : (index % 4) + 1,
        17,
      ),
      serverId: services.find((service) => service.clientId === client.id)?.serverId,
      messages:
        status === 'Novo'
          ? []
          : [
              publicMessage,
              ...(index % 3 === 0
                ? [
                    {
                      id: `${id}-message-internal`,
                      text: 'Nota interna de demonstração: revisar o cenário de rede antes do próximo retorno. Esta mensagem não aparece no portal do cliente.',
                      author: assignee.name,
                      internal: true,
                      createdAt: updatedAt,
                      attachments: [],
                    },
                  ]
                : []),
            ],
      history: [
        {
          id: `${id}-history-1`,
          date: createdAt,
          actor: client.contacts[0].name,
          description: 'Ticket criado pelo portal do cliente.',
        },
        ...(status !== 'Novo'
          ? [
              {
                id: `${id}-history-2`,
                date: updatedAt,
                actor: assignee.name,
                description: `Status alterado de Novo para ${status}.`,
              },
            ]
          : []),
      ],
      attachments:
        index < 4
          ? [
              {
                id: `${id}-sample`,
                name: 'referencia-demonstracao.pdf',
                type: 'application/pdf',
                size: 146000,
              },
            ]
          : [],
    };
  });

  const documents: DocumentRecord[] = Array.from({ length: 15 }, (_, index) => {
    const isContract = index < 8;
    const category = isContract
      ? 'Contrato'
      : (
          [
            'Aditivo',
            'Proposta',
            'Documento cadastral',
            'Documento técnico',
            'Outros',
            'Documento técnico',
            'Proposta',
          ] as const
        )[index - 8];
    return {
      id: `document-${String(index + 1).padStart(2, '0')}`,
      clientId: clients[index].id,
      name: `${isContract ? 'Contrato de prestação de serviços' : category} - ${clients[index].tradeName}.pdf`,
      type: 'application/pdf',
      size: 148500 + index * 14320,
      category,
      createdAt: relativeTime(-90 + index * 5, 10),
      responsibleId: index % 3 === 0 ? 'user-admin' : 'user-finance',
      shared: index % 4 !== 3,
      notes:
        'Registro fictício. O arquivo de exemplo não está anexado; selecione um arquivo local para visualizar nesta sessão.',
      ...(isContract
        ? {
            number: `DEMO-${now.getFullYear()}-${String(index + 1).padStart(3, '0')}`,
            startDate: relativeDate(-300 + index * 20),
            endDate: relativeDate([7, 14, 23, 90, 120, 180, -15, 240][index]),
            status:
              index === 6
                ? ('Encerrado' as const)
                : index === 1
                  ? ('Em renovação' as const)
                  : ('Vigente' as const),
            value: services[index].monthlyValue * 12,
            renewal: 'Revisão manual ao final da vigência.',
          }
        : {}),
    };
  });

  const charges: Charge[] = Array.from({ length: 40 }, (_, index) => {
    const clientIndex = index % 20;
    const current = index >= 20;
    const isLate = current && clientIndex < 6;
    const cancelled = clientIndex >= 18;
    const dueOffset = current
      ? isLate
        ? -2 - clientIndex
        : clientIndex < 11
          ? clientIndex - 6
          : 5 + clientIndex
      : -30 - (clientIndex % 5);
    const dueDate = relativeDate(dueOffset);
    const status = cancelled
      ? 'Cancelado'
      : !current || clientIndex === 15
        ? 'Pago'
        : isLate
          ? 'Vencido'
          : 'Pendente';
    return {
      id: `charge-${String(index + 1).padStart(2, '0')}`,
      number: `FAT-${String(2301 + index)}`,
      clientId: clients[clientIndex].id,
      description: `Mensalidade ${services[clientIndex].name}`,
      amount: services[clientIndex].monthlyValue + (clientIndex < 6 ? 49.9 : 0),
      dueDate,
      ...(status === 'Pago' ? { paidAt: relativeDate(Math.min(dueOffset - 1, 0)) } : {}),
      method: (['Boleto', 'Pix', 'Cartão', 'Transferência'] as const)[index % 4],
      status,
      reference: dueDate.slice(0, 7),
    };
  });
  const invoices: Invoice[] = Array.from({ length: 24 }, (_, index) => ({
    id: `invoice-${String(index + 1).padStart(2, '0')}`,
    number: `NF-DEMO-${String(901 + index)}`,
    clientId: clients[index % 20].id,
    competence: relativeDate(index < 20 ? -30 : 0).slice(0, 7),
    amount: charges[index].amount,
    status: index >= 20 ? 'Pendente' : index === 18 || index === 19 ? 'Cancelada' : 'Emitida',
  }));
  const eventTitles = [
    'Revisão de atendimento',
    'Visita à recepção',
    'Manutenção da interfonia',
    'Reunião de acompanhamento',
    'Instalação de novos ramais',
    'Revisão preventiva do PABX',
    'Treinamento do portal',
    'Validação da portabilidade',
    'Reunião de renovação',
    'Checklist de infraestrutura',
    'Atualização da URA',
    'Visita técnica programada',
    'Alinhamento com o financeiro',
    'Revisão de serviços',
    'Treinamento de telefonia',
  ];
  const eventOffsets = [0, 0, 1, 1, 2, 3, 4, 5, 7, 9, -1, -3, -5, 12, 16];
  const events: AgendaEvent[] = eventTitles.map((title, index) => ({
    id: `event-${String(index + 1).padStart(2, '0')}`,
    title,
    description:
      'Compromisso fictício. Use a agenda para simular planejamento, reagendamento e conclusão.',
    start: relativeTime(eventOffsets[index], 9 + (index % 4) * 2),
    end: relativeTime(eventOffsets[index], 10 + (index % 4) * 2),
    assigneeId: users[[1, 2, 5, 0, 3][index % 5]].id,
    clientId: clients[index].id,
    type: (['Reunião', 'Visita técnica', 'Manutenção', 'Outro'] as const)[index % 4],
    location: index % 3 === 0 ? 'Sala de reunião virtual (demo)' : `Unidade ${clients[index].city}`,
    status: eventOffsets[index] < 0 ? (index === 12 ? 'Cancelado' : 'Concluído') : 'Agendado',
  }));
  const activities: Activity[] = [
    ...clients.map((client) => ({
      id: `activity-${client.id}`,
      clientId: client.id,
      date: client.createdAt,
      actor: 'Amanda Torres',
      description: 'Cadastro de demonstração criado.',
    })),
    ...tickets
      .slice(0, 12)
      .map((ticket) => ({
        id: `activity-${ticket.id}`,
        clientId: ticket.clientId,
        ticketId: ticket.id,
        date: ticket.updatedAt,
        actor: users.find((user) => user.id === ticket.assigneeId)?.name || 'Equipe de suporte',
        description: `Ticket #${ticket.number}: ${ticket.status.toLowerCase()}.`,
      })),
  ];
  return {
    version: DATABASE_VERSION,
    seededAt: now.toISOString(),
    clients,
    tickets,
    servers,
    services,
    documents,
    charges,
    invoices,
    events,
    users,
    activities,
    settings: {
      company: {
        name: 'Telefonia Fácil • demonstração',
        tradeName: 'Telefonia Fácil',
        document: demoDocument('873451260001', 'PJ'),
        phone: '(19) 3000-0000',
        email: 'contato@telefonia.example',
        address: 'Avenida Exemplo, 100 • Campinas/SP',
      },
      ticketCategories: categories,
      serviceTypes,
      density: 'comfortable',
    },
  };
}
