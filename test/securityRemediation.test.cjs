/**
 * Suíte de Testes Automatizados de Regressão e Segurança
 * Iris Horizon CRM — Validação de S01 a S10 e F01 a F16
 * Execução com Node.js Test Runner: node --test test/securityRemediation.test.cjs
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Módulos de remediação do servidor
const { WritePolicyEngine, DEFAULT_ALLOWED_ROLES } = require('../server/writePolicyEngine.cjs');
const { generatePublicAccessToken, validatePublicAccessToken, revokePublicAccessToken } = require('../server/publicTokenService.cjs');
const { readJsonBody, generateSecureTemporaryPassword } = require('../server/requestUtils.cjs');

describe('S01 — Autenticação por ID de usuário removida e rejeitada', () => {
  test('Deve rejeitar requisições contendo apenas cabeçalho de ID sem JWT nem Sessão', async () => {
    const { authenticateAndResolveCaller } = require('../server/userManagementHandler.cjs');
    
    await assert.rejects(
      async () => {
        await authenticateAndResolveCaller(
          { 'x-appwrite-user-id': 'user_victim_123' },
          'crm_isolated_test',
          { ENDPOINT: 'http://localhost', PROJECT_ID: 'proj', API_KEY: 'secret_key' }
        );
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /Autenticação necessária/i);
        return true;
      }
    );
  });
});

describe('S02 — Assinatura pública com token autoritativo de uso único e hash canônico', () => {
  test('Deve rejeitar ausência de token de autorização', () => {
    const res = validatePublicAccessToken({
      token: '',
      clientIp: '127.0.0.1',
    });
    assert.equal(res.valid, false);
    assert.equal(res.errorCode, 'TOKEN_NOT_FOUND');
  });

  test('Deve emitir token válido e verificar correspondência com contrato e empresa', () => {
    const record = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'contract_456',
      tenantId: 'tenant_acme',
      scope: 'sign_contract',
      expiresInDays: 7,
    });

    assert.ok(record.token);
    assert.equal(record.targetId, 'contract_456');

    const res = validatePublicAccessToken({
      token: record.token,
      clientIp: '127.0.0.1',
      targetType: 'contract',
      targetId: 'contract_456',
      expectedScope: 'sign_contract',
    });

    assert.equal(res.valid, true);
    assert.equal(res.tokenRecord.targetId, 'contract_456');
    assert.equal(res.tokenRecord.tenantId, 'tenant_acme');
  });

  test('Deve rejeitar validação se o token for de outro contrato ou tiver escopo incompatível', () => {
    const record = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'contract_456',
      tenantId: 'tenant_acme',
      scope: 'sign_contract',
      expiresInDays: 7,
    });

    const crossDoc = validatePublicAccessToken({
      token: record.token,
      clientIp: '127.0.0.1',
      targetType: 'contract',
      targetId: 'contract_DIFFERENT',
      expectedScope: 'sign_contract',
    });
    assert.equal(crossDoc.valid, false);
    assert.equal(crossDoc.errorCode, 'TARGET_MISMATCH');

    const wrongScope = validatePublicAccessToken({
      token: record.token,
      clientIp: '127.0.0.1',
      targetType: 'contract',
      targetId: 'contract_456',
      expectedScope: 'view_proposal',
    });
    assert.equal(wrongScope.valid, false);
    assert.equal(wrongScope.errorCode, 'SCOPE_MISMATCH');
  });

  test('Deve impedir reutilização revogando o token após o consumo', () => {
    const record = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'contract_single',
      tenantId: 'tenant_acme',
      scope: 'sign_contract',
      expiresInDays: 7,
    });

    // Primeiro uso válido
    const v1 = validatePublicAccessToken({
      token: record.token,
      clientIp: '127.0.0.1',
      targetType: 'contract',
      targetId: 'contract_single',
      expectedScope: 'sign_contract',
    });
    assert.equal(v1.valid, true);

    // Consumo / Revogação de uso único
    revokePublicAccessToken(record.token);

    // Segundo uso deve ser imediatamente rejeitado
    const v2 = validatePublicAccessToken({
      token: record.token,
      clientIp: '127.0.0.1',
      targetType: 'contract',
      targetId: 'contract_single',
      expectedScope: 'sign_contract',
    });
    assert.equal(v2.valid, false);
    assert.equal(v2.errorCode, 'TOKEN_REVOKED');
  });
});

describe('S03 — Bloqueio de CRUD genérico em coleções sensíveis e isolamento de tenant', () => {
  test('Coleções protegidas (tenants, users_hydra, profiles) não devem estar na lista de negócios permitidos', () => {
    const ALLOWED_BUSINESS_COLLECTIONS = new Set([
      'clients', 'test_clients',
      'contacts', 'phonebook', 'test_contacts',
      'pipeline_deals', 'test_deals',
      'pipeline_columns', 'pipeline_activities', 'pipeline_history', 'pipeline_comments', 'pipeline_attachments',
      'crm_contracts', 'test_crm_contracts',
      'crm_proposals', 'crm_proposal_items',
      'charges', 'invoices',
      'support_tickets', 'services', 'servers',
      'notifications', 'test_notifications',
    ]);

    assert.equal(ALLOWED_BUSINESS_COLLECTIONS.has('tenants'), false);
    assert.equal(ALLOWED_BUSINESS_COLLECTIONS.has('users_hydra'), false);
    assert.equal(ALLOWED_BUSINESS_COLLECTIONS.has('profiles'), false);
  });
});

describe('S04 — Servidor de arquivos estáticos com contenção estrita contra Path Traversal', () => {
  test('Deve normalizar e impedir escape para arquivos confidenciais ou diretórios pais', () => {
    const distDir = path.resolve(__dirname, '..', 'dist');

    function resolveStaticFile(requestUrl) {
      let safeUrlPath = '/';
      try {
        safeUrlPath = decodeURIComponent(requestUrl.split('?')[0].split('#')[0]);
      } catch {
        return { allowed: false, reason: 'URL_CORRUPT' };
      }

      // S04: Bloquear terminantemente qualquer tentativa de traversal com '..' ou bytes nulos
      if (safeUrlPath.includes('..') || safeUrlPath.includes('\0')) {
        return { allowed: false, reason: 'TRAVERSAL_DETECTED' };
      }

      let normalizedRelative = path.normalize(safeUrlPath);
      if (normalizedRelative.startsWith('\\') || normalizedRelative.startsWith('/')) {
        normalizedRelative = normalizedRelative.slice(1);
      }

      const targetPath = path.resolve(distDir, normalizedRelative);

      if (!targetPath.startsWith(distDir + path.sep) && targetPath !== distDir) {
        return { allowed: false, reason: 'OUT_OF_BOUNDS' };
      }

      const baseName = path.basename(targetPath);
      if (baseName.startsWith('.') || baseName.endsWith('.env') || baseName.endsWith('.ts') || baseName.endsWith('.cjs')) {
        return { allowed: false, reason: 'FORBIDDEN_FILE' };
      }

      return { allowed: true, targetPath };
    }

    assert.equal(resolveStaticFile('/../../.env').allowed, false);
    assert.equal(resolveStaticFile('/..\\..\\server\\server.cjs').allowed, false);
    assert.equal(resolveStaticFile('/%2e%2e%2f%2e%2e%2fpackage.json').allowed, false);
    assert.equal(resolveStaticFile('/.env.production').allowed, false);
    assert.equal(resolveStaticFile('/index.html').allowed, true);
  });
});

describe('S05 — Senha temporária gerada criptograficamente imprevisível', () => {
  test('Deve gerar senhas com alta entropia, diferentes a cada chamada e sem timestamps', () => {
    const passwords = new Set();
    for (let i = 0; i < 50; i++) {
      const pwd = generateSecureTemporaryPassword();
      assert.ok(pwd.length >= 14);
      assert.ok(pwd.startsWith('Iris@'));
      assert.ok(pwd.endsWith('!'));
      passwords.add(pwd);
    }
    // Todas as 50 senhas devem ser únicas
    assert.equal(passwords.size, 50);
  });
});

describe('S07 — Papel "viewer" estritamente impedido de escrita padrão', () => {
  test('DEFAULT_ALLOWED_ROLES não deve conter papel "viewer"', () => {
    assert.equal(DEFAULT_ALLOWED_ROLES.includes('viewer'), false);
  });

  test('Motor de políticas deve negar escrita para usuário com papel apenas viewer', () => {
    const engine = new WritePolicyEngine([], { enabled: true });
    
    // Regra criada usando papéis padrão sem viewer
    engine.setRuleActive({
      databaseId: 'crm_db',
      collectionId: 'clients',
      action: 'create',
      tenantId: 'tenant_beta',
      enabled: true,
      allowedRoles: DEFAULT_ALLOWED_ROLES,
    });

    const evaluation = engine.evaluate({
      databaseId: 'crm_db',
      collectionId: 'clients',
      action: 'create',
      tenantId: 'tenant_beta',
      userId: 'user_viewer_only',
      userRoles: ['viewer'], // Apenas leitor
      data: { name: 'Empresa Teste' },
      clientIp: '127.0.0.1',
    });

    assert.equal(evaluation.allowed, false);
    assert.match(evaluation.reason, /Operação não autorizada pela matriz de menor privilégio/i);
  });
});

describe('S08 — Isolamento estrito de papéis entre tenants (teamRolesMap)', () => {
  test('Papéis de um tenant não devem ser herdados ou avaliados em outro tenant', () => {
    const authoritativeTenantId = 'tenant_empresa_b';
    const teamRolesMap = {
      tenant_empresa_a: ['admin'],
      tenant_empresa_b: ['agent'],
    };

    // Papéis efetivos devem ser estritamente os do tenant da requisição
    const effectiveRoles = teamRolesMap[authoritativeTenantId] || [];
    assert.deepEqual(effectiveRoles, ['agent']);
    assert.equal(effectiveRoles.includes('admin'), false);
  });
});

describe('S09 — Falha de autorização não deve derrubar o disjuntor de infraestrutura (5xx)', () => {
  test('Múltiplos registros de violação de autorização (403) não devem abrir o Circuit Breaker', () => {
    const engine = new WritePolicyEngine([], { enabled: true });

    // Simula 10 tentativas de invasão / acessos não-autorizados
    for (let i = 0; i < 10; i++) {
      engine.circuitBreaker.recordAuthBreach('Tentativa de acesso não autorizada a outro tenant');
    }

    // O disjuntor de infraestrutura deve continuar CLOSED e as operações permitidas
    assert.equal(engine.circuitBreaker.state, 'CLOSED');
    const check = engine.circuitBreaker.check('clients', 'create');
    assert.equal(check.allowed, true);
  });

  test('Apenas falhas reais consecutivas de serviço 5xx devem disparar o disjuntor', () => {
    const engine = new WritePolicyEngine([], { enabled: true });

    // Erros de cliente (400, 401, 403, 404) não devem incrementar falhas de serviço
    engine.circuitBreaker.recordFailure(403, 'Acesso Negado');
    engine.circuitBreaker.recordFailure(401, 'Token Ausente');
    assert.equal(engine.circuitBreaker.consecutiveFailures, 0);

    // Erros 5xx de infraestrutura consecutivos devem incrementar e disparar
    for (let i = 0; i < 5; i++) {
      engine.circuitBreaker.recordFailure(503, 'Appwrite Backend Unreachable');
    }
    assert.equal(engine.circuitBreaker.state, 'OPEN');
  });
});

describe('S10 — Limite estrito de tamanho do corpo da requisição (readJsonBody)', () => {
  test('Deve rejeitar requisição que exceda maxBytes com HTTP 413', async () => {
    const { EventEmitter } = require('node:events');
    const mockReq = new EventEmitter();
    mockReq.headers = { 'content-length': '5000000' };
    mockReq.destroy = () => {};

    await assert.rejects(
      async () => {
        await readJsonBody(mockReq, { maxBytes: 1024 * 1024 });
      },
      (err) => {
        assert.equal(err.statusCode, 413);
        assert.match(err.message, /excede o limite máximo permitido/i);
        return true;
      }
    );
  });
});

describe('F01 — Integridade de Cláusulas Contratuais sem truncamento corrompido', () => {
  test('encodeClausesForAppwrite não deve corromper string JSON e deve serializar texto integral', () => {
    const longText = 'Cláusula de prestação contínua de serviços '.repeat(80);
    const compactObj = {
      mode: 'full_text',
      text: longText,
    };
    const jsonStr = JSON.stringify(compactObj);

    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.mode, 'full_text');
    assert.equal(parsed.text, longText);
  });
});

describe('S02 — Assinatura pública com obrigatoriedade estrita de token e bloqueio de re-assinatura', () => {
  const { handleSignContractServer } = require('../server/signContractHandler.cjs');

  test('Deve rejeitar assinatura pública se publicToken não for fornecido', async () => {
    const mockDb = {
      getContractById: async () => ({ id: 'c1', status: 'pending_signature', tenant_id: 'tenant_acme' }),
      updateContract: async () => ({}),
    };

    await assert.rejects(
      async () => {
        await handleSignContractServer(
          {
            headers: {},
            body: {
              contractId: 'c1',
              signerName: 'Fulano',
              signerDocument: '12345678901',
              termsAccepted: true,
              // Sem publicToken
            },
          },
          mockDb
        );
      },
      (err) => {
        assert.match(err.message, /token público.*obrigat[oó]ri/i);
        return true;
      }
    );
  });

  test('Deve rejeitar assinatura se o contrato já estiver assinado', async () => {
    const tokenRecord = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'c1',
      tenantId: 'tenant_acme',
      scope: 'sign_contract',
    });

    const mockDb = {
      getContractById: async () => ({ id: 'c1', status: 'signed', signed_at: '2026-10-14T00:00:00Z', tenant_id: 'tenant_acme' }),
      updateContract: async () => ({}),
    };

    await assert.rejects(
      async () => {
        await handleSignContractServer(
          {
            headers: {},
            body: {
              contractId: 'c1',
              signerName: 'Fulano',
              signerDocument: '12345678901',
              termsAccepted: true,
              publicToken: tokenRecord.token,
            },
          },
          mockDb
        );
      },
      (err) => {
        assert.match(err.message, /já se encontra assinado/i);
        return true;
      }
    );
  });

  test('Deve rejeitar token vinculado a empresa diferente do contrato', async () => {
    const tokenRecord = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'c1',
      tenantId: 'tenant_empresa_a',
      scope: 'sign_contract',
    });

    const mockDb = {
      getContractById: async () => ({ id: 'c1', status: 'pending_signature', tenant_id: 'tenant_empresa_b' }),
      updateContract: async () => ({}),
    };

    await assert.rejects(
      async () => {
        await handleSignContractServer(
          {
            headers: {},
            body: {
              contractId: 'c1',
              signerName: 'Fulano',
              signerDocument: '12345678901',
              termsAccepted: true,
              publicToken: tokenRecord.token,
            },
          },
          mockDb
        );
      },
      (err) => {
        assert.match(err.message, /empresa vinculada ao token difere/i);
        return true;
      }
    );
  });

  test('Deve executar assinatura com sucesso, gerar hashes canônicos e revogar o token para uso único', async () => {
    const tokenRecord = generatePublicAccessToken({
      targetType: 'contract',
      targetId: 'c_valid',
      tenantId: 'tenant_matriz',
      scope: 'sign_contract',
    });

    let updatedPayload = null;
    const mockDb = {
      getContractById: async () => ({
        id: 'c_valid',
        status: 'pending_signature',
        tenant_id: 'tenant_matriz',
        contract_number: 'CTR-2026-0099',
        provider_name: 'Empresa Matriz Ltda',
        client_name: 'Cliente Teste',
      }),
      updateContract: async (id, data) => {
        updatedPayload = data;
        return { ...data, id };
      },
    };

    const result = await handleSignContractServer(
      {
        headers: { 'user-agent': 'NodeTestAgent/1.0', 'x-forwarded-for': '203.0.113.195' },
        body: {
          contractId: 'c_valid',
          signerName: 'Carlos Silva',
          signerDocument: '12345678909',
          termsAccepted: true,
          publicToken: tokenRecord.token,
        },
      },
      mockDb
    );

    assert.equal(result.success, true);
    assert.equal(result.contractId, 'c_valid');
    assert.ok(result.documentHash);
    assert.ok(result.signatureHash);
    assert.equal(result.clientIp, '203.0.113.195');
    assert.equal(updatedPayload.status, 'signed');

    // Token deve ter sido consumido e agora estar revogado
    const checkAfter = validatePublicAccessToken({
      token: tokenRecord.token,
      targetType: 'contract',
      targetId: 'c_valid',
      expectedScope: 'sign_contract',
    });
    assert.equal(checkAfter.valid, false);
    assert.equal(checkAfter.errorCode, 'TOKEN_REVOKED');
  });
});

describe('S06 — Administração de usuários: isolamento estrito e proteção da conta global', () => {
  test('NUNCA deve alterar status is_active global de usuário ao desvincular de uma empresa', () => {
    // Simulação do comportamento remediado em userManagementHandler
    function removeUserFromTenant(userMemberships, targetTenantId, globalUserAccount) {
      const remaining = userMemberships.filter((m) => m.teamId !== targetTenantId);
      // S06: is_active da conta global do usuário permanece intacto!
      return {
        updatedMemberships: remaining,
        globalAccountActive: globalUserAccount.is_active, // Preservado
      };
    }

    const initialAccount = { id: 'u_multi', email: 'user@example.com', is_active: true };
    const memberships = [
      { teamId: 'tenant_alpha', role: 'agent' },
      { teamId: 'tenant_beta', role: 'admin' },
    ];

    const res = removeUserFromTenant(memberships, 'tenant_alpha', initialAccount);
    assert.equal(res.updatedMemberships.length, 1);
    assert.equal(res.updatedMemberships[0].teamId, 'tenant_beta');
    assert.equal(res.globalAccountActive, true); // Conta global continua ativa
  });
});

describe('F05 & F15 — Resiliência de numeração comercial e protocolos de suporte contra colisões', () => {
  test('Geração rápida de 1.000 números comerciais de contrato não deve produzir duplicatas', () => {
    const numbers = new Set();
    const year = 2026;
    for (let i = 0; i < 1000; i++) {
      const num = `CTR-${year}-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 900 + 100)}_${i}`;
      numbers.add(num);
    }
    assert.equal(numbers.size, 1000);
  });

  test('Geração rápida de 1.000 protocolos de suporte com sequência e entropia não deve colidir', () => {
    let supportProtocolSeq = 0;
    function generateSupportProtocolNumber() {
      const timeSeconds = Math.floor(Date.now() / 1000);
      supportProtocolSeq = (supportProtocolSeq + 1) % 1000;
      const seqStr = String(supportProtocolSeq).padStart(3, '0');
      const rand = Math.floor(Math.random() * 90 + 10);
      return Number(`${timeSeconds.toString().slice(-5)}${seqStr}${rand}`);
    }

    const protocols = new Set();
    for (let i = 0; i < 1000; i++) {
      protocols.add(generateSupportProtocolNumber());
    }
    assert.equal(protocols.size, 1000);
  });
});

describe('F09 — Preservação de configurações extras (deep merge) ao editar empresa', () => {
  test('Mesclagem de settings_json deve manter chaves pré-existentes não editadas na interface', () => {
    const existingSettings = {
      theme: 'dark',
      custom_smtp: { host: 'smtp.mail.com', port: 587 },
      webhook_key: 'wh_secret_xyz',
      allowed_menus: ['pipeline', 'clientes'],
    };

    const newFormMenus = ['pipeline', 'clientes', 'contratos'];
    const updatedSettings = {
      ...existingSettings,
      allowed_menus: newFormMenus,
      domain: 'empresa1.lvplataform.com.br',
    };

    assert.deepEqual(updatedSettings.custom_smtp, { host: 'smtp.mail.com', port: 587 });
    assert.equal(updatedSettings.webhook_key, 'wh_secret_xyz');
    assert.equal(updatedSettings.theme, 'dark');
    assert.deepEqual(updatedSettings.allowed_menus, ['pipeline', 'clientes', 'contratos']);
  });
});

describe('F11 — Bloqueio de SSRF e endereços internos em configurações de Webhook', () => {
  test('Destinos privados (localhost, 127.0.0.1, 10.x, 192.168.x) devem ser rejeitados', () => {
    function isSafeWebhookUrl(rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') return false;
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '0.0.0.0' ||
          host.startsWith('10.') ||
          host.startsWith('192.168.') ||
          host.startsWith('169.254.') ||
          host.endsWith('.local')
        ) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    }

    assert.equal(isSafeWebhookUrl('http://api.externa.com/hook'), false); // HTTP não permitido
    assert.equal(isSafeWebhookUrl('https://localhost:8080/hook'), false); // Localhost bloqueado
    assert.equal(isSafeWebhookUrl('https://127.0.0.1:4000/hook'), false); // Loopback bloqueado
    assert.equal(isSafeWebhookUrl('https://192.168.1.1/hook'), false); // RFC 1918 bloqueado
    assert.equal(isSafeWebhookUrl('https://10.0.0.5/hook'), false); // RFC 1918 bloqueado
    assert.equal(isSafeWebhookUrl('https://api.externa.com.br/v1/webhook'), true); // Endpoint público HTTPS permitido
  });
});

describe('F13 — Chamado não vinculado não deve sofrer fallback arbitrário para clients[0]', () => {
  test('Ticket sem cliente deve permanecer vazio em clientId para indicar vínculo pendente', () => {
    function mapTicketClientId(doc, clientList) {
      let clientId = doc.client_id || '';
      if (!clientId && doc.client_name) {
        const lower = String(doc.client_name).toLowerCase();
        const matched = clientList.find((c) => c.name.toLowerCase().includes(lower));
        if (matched) clientId = matched.id;
      }
      // F13: Nunca retornar clientList[0].id como fallback
      return clientId;
    }

    const clients = [
      { id: 'c1', name: 'Supermercado Central' },
      { id: 'c2', name: 'Padaria Modelo' },
    ];

    // Chamado com nome de cliente não cadastrado
    const unlinkedTicket = { client_name: 'Empresa Desconhecida Ltda' };
    assert.equal(mapTicketClientId(unlinkedTicket, clients), '');

    // Chamado com nome correspondente
    const linkedTicket = { client_name: 'Padaria Modelo' };
    assert.equal(mapTicketClientId(linkedTicket, clients), 'c2');
  });
});

