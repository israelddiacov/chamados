/**
 * ============================================================================
 * SISTEMA DAVID REFORMAS — PINTURA, ALVENARIA, PISOS E REFORMAS EM GERAL
 * - Vitrine Aberta para Clientes + Calendário de Visitas/Orçamentos
 * - Modal Passo a Passo em 3 Páginas + Envio Direto WhatsApp e Google Agenda
 * - Painel do Profissional (Protegido por Senha Embaralhada) + Gerador de Orçamento e Recibo em PDF
 * ============================================================================
 */

const DavidReformasApp = (() => {
  const STORAGE_KEYS = {
    SECURITY_CSV: 'david_reformas_sec_csv_v1',
    ADMIN_SESSION: 'david_reformas_admin_session_v1',
    SERVICES_CSV: 'david_reformas_servicos_csv_v1',
    TICKETS_DB: 'david_reformas_visitas_db_v1',
    CLOUD_CFG: 'david_reformas_cloud_cfg_v1'
  };

  // Senha administrativa embaralhada com Salt + SHA-256 (zero senha em texto puro no código)
  const DEFAULT_SECURITY_CSV = [
    'perfil;salt_embaralhador;senha_embaralhada_hash;atualizado_em',
    'ADMIN;SL-2026-DVD;356d84733e6d18918e1d295fffaeabd61817250d63b6b57b916539fb18db24e0;2026-11-03'
  ].join('\n');

  const DEFAULT_SERVICES_CSV = [
    'codigo;nome_servico;categoria;duracao_visita_min;valor_base_referencia;texto_automatico',
    'REF-01;Pintura Interna Residencial / Apartamento (Paredes e Tetos);Pintura;60;450.00;[Pintura Interna] Pintura de paredes e tetos internos com preparação de superfície',
    'REF-02;Pintura Externa / Fachadas, Muros e Grades;Pintura;60;600.00;[Pintura Externa] Pintura de fachada/área externa, muros ou grades com proteção climática',
    'REF-03;Aplicação de Massa Corrida / Massa Acrílica, Textura ou Grafiato;Pintura e Acabamento;60;500.00;[Massa e Textura] Nivelamento com massa corrida/acrílica, lixamento ou aplicação de textura',
    'REF-04;Tratamento de Trincas, Umidade, Mofo e Infiltração;Pintura e Reparo;45;350.00;[Tratamento de Parede] Correção de trincas, descascados, manchas de umidade e mofo',
    'REF-05;Pintura de Portas, Janelas, Rodapés ou Madeiramento;Pintura;45;280.00;[Pintura de Esquadrias] Esmalte/verniz em portas, janelas, portões ou madeiras',
    'REF-06;Assentamento de Porcelanato, Pisos Cerâmicos e Azulejos;Pisos e Revestimentos;60;750.00;[Pisos e Revestimentos] Assentamento/troca de piso cerâmico, porcelanato ou revestimento de parede',
    'REF-07;Alvenaria, Construção de Parede, Muro, Reboco ou Contrapiso;Alvenaria;60;650.00;[Alvenaria e Reboco] Serviço de alvenaria, levantamento de parede/muro, reboco ou contrapiso',
    'REF-08;Reforma de Banheiro, Cozinha ou Área Gourmet;Reforma Completa;60;1200.00;[Reforma de Ambiente] Reforma e acabamento em cozinha, banheiro ou área de serviço/churrasqueira',
    'REF-09;Reparos em Telhado, Calhas, Laje e Impermeabilização;Telhado e Vedação;60;400.00;[Telhado e Impermeabilização] Revisão de telhas, calhas ou impermeabilização contra goteiras',
    'REF-10;Pequenos Reparos Residenciais / Visita Técnica de Orçamento Geral;Orçamento Geral;45;150.00;[Avaliação e Reparos] Visita técnica para levantamento de serviços e orçamento no local'
  ].join('\n');

  const MARKER_NOTES = 'Detalhes adicionais do cliente (metragem aproximada, cômodos, etc.):';
  const BUFFER_DESLOCAMENTO_MIN = 30; // 30 minutos de reserva para deslocamento entre uma visita e outra
  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  let activeTopSection = 'cliente'; // 'cliente' | 'admin'
  let activeAdminTab = 'calendario'; // 'calendario' | 'orcamento' | 'catalogo' | 'seguranca'
  let selectedServiceCodes = [];
  let clientCalDate = new Date();
  let adminCalDate = new Date();
  let selectedAdminDayIso = null;
  let currentWizardStep = 1;
  let lastCreatedVisit = null;

  /* ==========================================================================
     SHA-256 & SEGURANÇA
     ========================================================================== */
  function sha256Pure(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    const lengthProperty = 'length';
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii[lengthProperty] * 8;
    let hash = (sha256Pure.h = sha256Pure.h || []);
    const k = (sha256Pure.k = sha256Pure.k || []);
    let primeCounter = k[lengthProperty];
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return '';
      words[i >> 2] |= j << ((3 - (i % 4)) * 8);
    }
    words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
    words[words[lengthProperty]] = asciiBitLength;
    for (j = 0; j < words[lengthProperty]; ) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 =
          hash[7] +
          (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
                0);
        const temp2 =
          (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
          ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  function scramblePasswordWithSalt(plainPassword, salt) {
    const cleanPass = String(plainPassword || '').trim();
    const cleanSalt = String(salt || 'SL-2026-DVD').trim();
    const revPass = cleanPass.split('').reverse().join('');
    const revSalt = cleanSalt.split('').reverse().join('');
    const mixed = `${cleanSalt}::${revPass}::${cleanPass.length}::${revSalt}`;
    return sha256Pure(unescape(encodeURIComponent(mixed)));
  }

  function getAdminCredentials() {
    const raw = localStorage.getItem(STORAGE_KEYS.SECURITY_CSV) || DEFAULT_SECURITY_CSV;
    const lines = raw.trim().split(/\r?\n/).filter(Boolean);
    const cols = (lines[1] || '').split(';').map(c => c.trim());
    return {
      salt: cols[1] || 'SL-2026-DVD',
      hash: cols[2] || ''
    };
  }

  function validateAdminPassword(inputPass) {
    const cred = getAdminCredentials();
    const candidate = scramblePasswordWithSalt(inputPass, cred.salt);
    if (candidate === cred.hash) {
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, candidate);
      return { ok: true };
    }
    return { ok: false, error: 'Senha incorreta. Acesso exclusivo ao profissional David Reformas.' };
  }

  function isAdminAuthenticated() {
    const cred = getAdminCredentials();
    return sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION) === cred.hash;
  }

  function updateAdminPassword(newPass) {
    const clean = String(newPass || '').trim();
    if (clean.length < 5) {
      return { ok: false, error: 'A nova senha deve ter pelo menos 5 caracteres.' };
    }
    const newSalt = `SL-${Math.floor(1000 + Math.random() * 9000)}-DVD`;
    const newHash = scramblePasswordWithSalt(clean, newSalt);
    const today = new Date().toISOString().slice(0, 10);
    const csv = [
      'perfil;salt_embaralhador;senha_embaralhada_hash;atualizado_em',
      `ADMIN;${newSalt};${newHash};${today}`
    ].join('\n');
    localStorage.setItem(STORAGE_KEYS.SECURITY_CSV, csv);
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, newHash);
    return { ok: true, csv };
  }

  function loadCloudConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CLOUD_CFG);
      if (!raw) {
        return {
          profissionalNome: 'David Reformas — Pintura & Construção',
          whatsappProfissional: '',
          emailGoogle: '',
          emailIcloud: 'david@icloud.com',
          chavePix: '',
          gasWebAppUrl: ''
        };
      }
      const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!data.emailIcloud && data.emailGoogle) data.emailIcloud = data.emailGoogle;
      return data;
    } catch (e) {
      return {
        profissionalNome: 'David Reformas — Pintura & Construção',
        whatsappProfissional: '',
        emailGoogle: '',
        emailIcloud: 'david@icloud.com',
        chavePix: '',
        gasWebAppUrl: ''
      };
    }
  }

  function saveCloudConfig(cfg) {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(cfg || {}))));
    localStorage.setItem(STORAGE_KEYS.CLOUD_CFG, encoded);
  }

  /* ==========================================================================
     SINCRONIZAÇÃO E EVENTOS APPLE ICALENDAR (.ICS NATIVO DO IPHONE / ICLOUD)
     ========================================================================== */
  function generateIcsContent(visit) {
    const dtStart = new Date(visit.sugestao1ISO);
    const durMin = Number(visit.duracaoMinutos) || 60;
    const dtEnd = new Date(dtStart.getTime() + durMin * 60000);

    function pad2(n) { return String(n).padStart(2, '0'); }
    function toIcsUtc(d) {
      return (
        d.getUTCFullYear() +
        pad2(d.getUTCMonth() + 1) +
        pad2(d.getUTCDate()) +
        'T' +
        pad2(d.getUTCHours()) +
        pad2(d.getUTCMinutes()) +
        pad2(d.getUTCSeconds()) +
        'Z'
      );
    }

    const startStr = toIcsUtc(dtStart);
    const endStr = toIcsUtc(dtEnd);
    const nowStr = toIcsUtc(new Date());

    const cleanDesc = (visit.descricao || '')
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');

    const cleanLoc = `${visit.tipoImovel || 'Imóvel'} - ${visit.enderecoObra || ''}`
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');

    const clientName = (visit.nomeCliente || 'Cliente').replace(/[,;]/g, ' ');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//David Reformas//Apple iOS iCalendar//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:david-reformas-${visit.id}@icloud.com`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:🧱 Visita Técnica / Orçamento: ${clientName}`,
      `DESCRIPTION:${cleanDesc}\\n\\nCliente: ${clientName}\\nWhatsApp: ${visit.whatsapp || ''}`,
      `LOCATION:${cleanLoc}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Lembrete: Visita Técnica em 1 hora com ${clientName}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Lembrete: Visita Técnica em 15 minutos com ${clientName}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function downloadOrOpenIcs(visit) {
    if (!visit || !visit.sugestao1ISO) return;
    const icsData = generateIcsContent(visit);
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' });
    const filename = `visita_${visit.id}_${(visit.nomeCliente || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '_')}.ics`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
    showToast('Abrindo evento no Calendário do iPhone / Apple Calendar!', 'slate');
  }

  /* ==========================================================================
     CATÁLOGO DE SERVIÇOS DE REFORMA & PINTURA
     ========================================================================== */
  function getServicesCsvRaw() {
    return localStorage.getItem(STORAGE_KEYS.SERVICES_CSV) || DEFAULT_SERVICES_CSV;
  }

  function setServicesCsvRaw(csv) {
    localStorage.setItem(STORAGE_KEYS.SERVICES_CSV, csv.trim());
  }

  function parseServices() {
    const lines = getServicesCsvRaw().trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(1).map((line, idx) => {
      const cols = line.split(';').map(c => c.trim());
      return {
        codigo: cols[0] || `REF-0${idx + 1}`,
        nome: cols[1] || 'Serviço de Reforma',
        categoria: cols[2] || 'Geral',
        duracaoMinutos: Number(cols[3]) || 60,
        valorBase: Number(cols[4]) || 300,
        textoAutomatico: cols[5] || `[Serviço] ${cols[1]}`
      };
    });
  }

  function serializeServices(list) {
    const header = 'codigo;nome_servico;categoria;duracao_visita_min;valor_base_referencia;texto_automatico';
    const rows = list.map(s => `${s.codigo};${s.nome};${s.categoria};${s.duracaoMinutos};${Number(s.valorBase).toFixed(2)};${s.textoAutomatico}`);
    return [header, ...rows].join('\n');
  }

  function buildDescriptionWithServices(codes, currentText) {
    const all = parseServices();
    const selected = codes.map(c => all.find(s => s.codigo === c)).filter(Boolean);

    let customNotes = '';
    const txt = String(currentText || '');
    if (txt.includes(MARKER_NOTES)) {
      customNotes = txt.split(MARKER_NOTES).slice(1).join(MARKER_NOTES).replace(/^\r?\n/, '');
    } else if (!txt.startsWith('Serviços solicitados para orçamento:') && txt.trim().length > 0) {
      customNotes = txt.trim();
    }

    if (selected.length === 0) return customNotes;

    const bullets = selected.map((s, i) => `• ${i + 1}. ${s.textoAutomatico}`);
    return [
      'Serviços solicitados para orçamento:',
      ...bullets,
      '',
      MARKER_NOTES,
      customNotes || ''
    ].join('\n');
  }

  function calculateSummary(codes) {
    const all = parseServices();
    const selected = (codes || []).map(c => all.find(s => s.codigo === c)).filter(Boolean);
    if (selected.length === 0) {
      return {
        duracaoMinutos: 60,
        valorTotal: 350,
        nomes: ['Avaliação e Orçamento no Local'],
        codigos: []
      };
    }
    const valorTotal = selected.reduce((acc, s) => acc + (Number(s.valorBase) || 0), 0);
    return {
      duracaoMinutos: 60,
      valorTotal,
      nomes: selected.map(s => s.nome),
      codigos: selected.map(s => s.codigo)
    };
  }

  /* ==========================================================================
     AGENDAMENTO E VISITAS (COM 30 MIN DE RESERVA DE DESLOCAMENTO)
     ========================================================================== */
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateBR(dt) {
    return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  }

  function formatTimeBR(dt) {
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  function formatDateTimeBR(iso) {
    if (!iso) return 'Não informado';
    const dt = new Date(iso);
    if (isNaN(dt)) return iso;
    return `${formatDateBR(dt)} às ${formatTimeBR(dt)}`;
  }

  function formatCurrencyBR(val) {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function enrichVisit(visit) {
    const start = new Date(visit.sugestao1ISO);
    const dur = Number(visit.duracaoMinutos) || 60;
    const endVisit = new Date(start.getTime() + dur * 60000);
    const endWithTravel = new Date(endVisit.getTime() + BUFFER_DESLOCAMENTO_MIN * 60000);

    return {
      ...visit,
      dataBR: formatDateBR(start),
      horaInicio: formatTimeBR(start),
      horaFimVisita: formatTimeBR(endVisit),
      horaFimComDeslocamento: formatTimeBR(endWithTravel),
      sugestao1Formatada: formatDateTimeBR(visit.sugestao1ISO),
      sugestao2Formatada: visit.sugestao2ISO ? formatDateTimeBR(visit.sugestao2ISO) : 'Não informada'
    };
  }

  function getSeedVisits() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const makeIso = (d, h, min) => {
      const maxD = new Date(y, m + 1, 0).getDate();
      return new Date(y, m, Math.min(d, maxD), h, min, 0).toISOString();
    };

    return [
      {
        id: 'OBR-101',
        tipoImovel: 'Casa Residencial',
        nomeCliente: 'Israel Diacov',
        whatsapp: '(41) 99924-8171',
        enderecoObra: 'Bairro Residencial — Pintura Residencial',
        servicosCodigos: ['REF-01', 'REF-02', 'REF-04'],
        servicosNomes: [
          'Pintura Interna Residencial / Apartamento (Paredes e Tetos)',
          'Pintura Externa / Fachadas, Muros e Grades',
          'Tratamento de Trincas, Umidade, Mofo e Infiltração'
        ],
        descricao:
          'Serviços solicitados para orçamento:\n• 1. [Pintura Interna] Pintura de paredes e tetos internos com preparação de superfície\n• 2. [Pintura Externa] Pintura de fachada/área externa, muros ou grades com proteção climática\n• 3. [Tratamento de Parede] Correção de trincas, descascados, manchas de umidade e mofo\n\nDetalhes adicionais do cliente (metragem aproximada, cômodos, etc.):\nAvaliação completa para pintura da casa.',
        sugestao1ISO: makeIso(now.getDate() + 1, 9, 0),
        sugestao2ISO: makeIso(now.getDate() + 1, 14, 0),
        duracaoMinutos: 60,
        valorEstimado: 1400.0,
        prazoObra: '5 a 7 dias úteis',
        condicaoPagamento: '50% no início da obra e 50% na entrega final (PIX ou Dinheiro)',
        status: 'confirmado'
      },
      {
        id: 'OBR-102',
        tipoImovel: 'Condomínio / Apartamento',
        nomeCliente: 'Ricardo Oliveira',
        whatsapp: '(41) 98811-2233',
        enderecoObra: 'Condomínio Jardim das Américas',
        servicosCodigos: ['REF-06', 'REF-03'],
        servicosNomes: [
          'Assentamento de Porcelanato, Pisos Cerâmicos e Azulejos',
          'Aplicação de Massa Corrida / Massa Acrílica, Textura ou Grafiato'
        ],
        descricao:
          'Serviços solicitados para orçamento:\n• 1. [Pisos e Revestimentos] Assentamento/troca de piso cerâmico, porcelanato ou revestimento de parede\n• 2. [Massa e Textura] Nivelamento com massa corrida/acrílica, lixamento ou aplicação de textura\n\nDetalhes adicionais do cliente (metragem aproximada, cômodos, etc.):\nSala e cozinha integradas (aprox. 42m²).',
        sugestao1ISO: makeIso(now.getDate() + 2, 14, 0),
        sugestao2ISO: makeIso(now.getDate() + 3, 9, 30),
        duracaoMinutos: 60,
        valorEstimado: 1250.0,
        prazoObra: '4 dias úteis',
        condicaoPagamento: 'A combinar após visita técnica',
        status: 'pendente'
      }
    ].map(enrichVisit);
  }

  function getAllVisits() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TICKETS_DB);
      if (!raw) {
        const seed = getSeedVisits();
        localStorage.setItem(STORAGE_KEYS.TICKETS_DB, JSON.stringify(seed));
        return seed;
      }
      return (JSON.parse(raw) || []).map(enrichVisit);
    } catch (e) {
      return [];
    }
  }

  function saveAllVisits(list) {
    const enriched = (list || []).map(enrichVisit);
    localStorage.setItem(STORAGE_KEYS.TICKETS_DB, JSON.stringify(enriched));
    return enriched;
  }

  function addVisit(data) {
    const all = getAllVisits();
    const newVisit = enrichVisit({
      id: `OBR-${101 + all.length}`,
      tipoImovel: data.tipoImovel || 'Casa Residencial',
      nomeCliente: data.nomeCliente,
      whatsapp: data.whatsapp,
      enderecoObra: data.enderecoObra || 'A informar no WhatsApp',
      servicosCodigos: data.servicosCodigos || [],
      servicosNomes: data.servicosNomes || [],
      descricao: data.descricao || '',
      sugestao1ISO: data.sugestao1ISO,
      sugestao2ISO: data.sugestao2ISO || '',
      duracaoMinutos: 60,
      valorEstimado: Number(data.valorEstimado) || 400,
      prazoObra: 'A definir na avaliação local',
      condicaoPagamento: '50% na aprovação e 50% na entrega dos serviços',
      status: 'pendente'
    });
    all.unshift(newVisit);
    saveAllVisits(all);
    return newVisit;
  }

  /* ==========================================================================
     INICIALIZAÇÃO E EVENTOS DE UI
     ========================================================================== */
  function init() {
    // Corrigir pequeno typo se sha256Pure for chamado na primeira vez
    bindEvents();
    populateClientCatalog();
    renderViews();
  }

  function bindEvents() {
    document.getElementById('navBtnCliente')?.addEventListener('click', () => {
      activeTopSection = 'cliente';
      renderViews();
    });

    document.getElementById('navBtnAdmin')?.addEventListener('click', () => {
      activeTopSection = 'admin';
      renderViews();
    });

    document.getElementById('btnClientCalPrev')?.addEventListener('click', () => {
      clientCalDate = new Date(clientCalDate.getFullYear(), clientCalDate.getMonth() - 1, 1);
      renderClientCalendar();
    });

    document.getElementById('btnClientCalNext')?.addEventListener('click', () => {
      clientCalDate = new Date(clientCalDate.getFullYear(), clientCalDate.getMonth() + 1, 1);
      renderClientCalendar();
    });

    document.getElementById('btnCloseClientWizard')?.addEventListener('click', () => {
      document.getElementById('modalClientWizard')?.classList.add('hidden');
    });

    document.getElementById('btnWizardNext1')?.addEventListener('click', () => {
      const s1 = document.getElementById('inputSugestao1')?.value;
      if (!s1) {
        showToast('Escolha o dia e horário para a visita antes de avançar.', 'rose');
        return;
      }
      setWizardStep(2);
    });

    document.getElementById('btnWizardBack2')?.addEventListener('click', () => setWizardStep(1));

    document.getElementById('btnWizardNext2')?.addEventListener('click', () => {
      const desc = document.getElementById('inputDescricaoChamado')?.value.trim();
      if (selectedServiceCodes.length === 0 && (!desc || desc.length < 3)) {
        showToast('Selecione pelo menos um serviço (ex: Pintura, Alvenaria) ou descreva o que precisa.', 'rose');
        return;
      }
      setWizardStep(3);
    });

    document.getElementById('btnWizardBack3')?.addEventListener('click', () => {
      document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
      document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
      setWizardStep(2);
    });

    document.getElementById('btnWizardPreConclude')?.addEventListener('click', handlePreConclude);
    document.getElementById('btnCancelConfirmTicket')?.addEventListener('click', () => {
      document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
      document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
    });
    document.getElementById('btnFinalConfirmSend')?.addEventListener('click', handleFinalConfirmAndSend);
    document.getElementById('btnClientAddToIphoneCal')?.addEventListener('click', () => {
      if (lastCreatedVisit) {
        downloadOrOpenIcs(lastCreatedVisit);
      } else {
        const visits = getAllVisits();
        if (visits[0]) downloadOrOpenIcs(visits[0]);
      }
    });

    document.getElementById('btnAddService')?.addEventListener('click', () => {
      const sel = document.getElementById('selectServiceCatalog');
      if (sel && sel.value) addServiceCode(sel.value);
    });

    document.getElementById('inputWhatsapp')?.addEventListener('input', e => {
      const digits = String(e.target.value || '').replace(/\D/g, '').slice(0, 11);
      if (digits.length <= 2) e.target.value = digits ? `(${digits}` : '';
      else if (digits.length <= 6) e.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      else if (digits.length <= 10) e.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
      else e.target.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    });

    // Login Admin
    document.getElementById('formAdminLogin')?.addEventListener('submit', e => {
      e.preventDefault();
      const pass = document.getElementById('adminPasswordInput')?.value;
      const res = validateAdminPassword(pass);
      const errEl = document.getElementById('adminLoginError');
      if (!res.ok) {
        errEl.textContent = res.error;
        errEl.classList.remove('hidden');
        return;
      }
      errEl.classList.add('hidden');
      document.getElementById('adminPasswordInput').value = '';
      renderViews();
      showToast('Painel do Profissional desbloqueado!', 'amber');
    });

    document.getElementById('btnLogoutAdmin')?.addEventListener('click', () => {
      sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
      renderViews();
      showToast('Painel bloqueado.', 'slate');
    });

    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeAdminTab = btn.getAttribute('data-admin-tab');
        renderAdminTabs();
      });
    });

    document.getElementById('btnCalPrev')?.addEventListener('click', () => {
      adminCalDate = new Date(adminCalDate.getFullYear(), adminCalDate.getMonth() - 1, 1);
      renderAdminCalendarAndList();
    });

    document.getElementById('btnCalNext')?.addEventListener('click', () => {
      adminCalDate = new Date(adminCalDate.getFullYear(), adminCalDate.getMonth() + 1, 1);
      renderAdminCalendarAndList();
    });

    // Gerador de Orçamento e Recibo em PDF
    document.getElementById('quoteSelectVisit')?.addEventListener('change', handleQuoteSelectVisitChange);
    document.getElementById('btnGenerateQuotePdf')?.addEventListener('click', () => openPrintableDocument('ORCAMENTO'));
    document.getElementById('btnGenerateReceiptPdf')?.addEventListener('click', () => openPrintableDocument('RECIBO'));
    document.getElementById('btnSendQuoteWhatsApp')?.addEventListener('click', sendQuoteViaWhatsApp);

    // Segurança e Config
    document.getElementById('formUpdatePasswords')?.addEventListener('submit', e => {
      e.preventDefault();
      const newP = document.getElementById('inputNewAdminPass')?.value;
      const res = updateAdminPassword(newP);
      if (!res.ok) {
        showToast(res.error, 'rose');
        return;
      }
      document.getElementById('inputNewAdminPass').value = '';
      showToast('Nova senha embaralhada e salva com sucesso!', 'emerald');
    });

    document.getElementById('formSaveCloudConfig')?.addEventListener('submit', e => {
      e.preventDefault();
      const mail = document.getElementById('cfgOwnerEmail')?.value.trim() || '';
      saveCloudConfig({
        profissionalNome: document.getElementById('cfgProfNome')?.value.trim() || 'David Reformas — Pintura & Construção',
        whatsappProfissional: document.getElementById('cfgOwnerWhatsapp')?.value.trim() || '',
        emailIcloud: mail,
        emailGoogle: mail,
        chavePix: document.getElementById('cfgPixKey')?.value.trim() || '',
        gasWebAppUrl: document.getElementById('cfgGasUrl')?.value.trim() || ''
      });
      showToast('Dados do profissional salvos com sucesso!', 'emerald');
    });
  }

  function renderViews() {
    const secCli = document.getElementById('sectionClienteWrapper');
    const secAdm = document.getElementById('sectionAdminWrapper');
    const btnCli = document.getElementById('navBtnCliente');
    const btnAdm = document.getElementById('navBtnAdmin');

    if (activeTopSection === 'cliente') {
      secCli?.classList.remove('hidden');
      secAdm?.classList.add('hidden');
      btnCli?.classList.add('bg-amber-600', 'text-white', 'shadow-sm');
      btnCli?.classList.remove('text-slate-700');
      btnAdm?.classList.remove('bg-amber-600', 'text-white', 'shadow-sm');
      btnAdm?.classList.add('text-slate-700');
      renderClientCalendar();
    } else {
      secCli?.classList.add('hidden');
      secAdm?.classList.remove('hidden');
      btnAdm?.classList.add('bg-amber-600', 'text-white', 'shadow-sm');
      btnAdm?.classList.remove('text-slate-700');
      btnCli?.classList.remove('bg-amber-600', 'text-white', 'shadow-sm');
      btnCli?.classList.add('text-slate-700');

      const lock = document.getElementById('adminLockScreen');
      const app = document.getElementById('adminUnlockedContent');
      if (isAdminAuthenticated()) {
        lock?.classList.add('hidden');
        app?.classList.remove('hidden');
        renderAdminTabs();
      } else {
        lock?.classList.remove('hidden');
        app?.classList.add('hidden');
      }
    }
  }

  function renderClientCalendar() {
    const visits = getAllVisits();
    const year = clientCalDate.getFullYear();
    const month = clientCalDate.getMonth();

    setText('clientCalendarMonthTitle', `${MESES[month]} de ${year}`);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('clientCalendarGridCells');
    if (!grid) return;

    const monthVisits = visits.filter(v => {
      if (v.status === 'cancelado') return false;
      const dt = new Date(v.sugestao1ISO);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="min-h-[108px] rounded-xl bg-slate-50 border border-slate-100"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const isoDay = `${year}-${pad2(month + 1)}-${pad2(d)}`;
      const dayVisits = monthVisits
        .filter(v => new Date(v.sugestao1ISO).getDate() === d)
        .sort((a, b) => new Date(a.sugestao1ISO) - new Date(b.sugestao1ISO));

      const badges =
        dayVisits.length === 0
          ? `<div class="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 mt-1">
               🟢 Livre p/ Orçamento
             </div>`
          : dayVisits
              .map(
                v => `<div class="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 truncate">
                        🔴 Ocupado: ${v.horaInicio} - ${v.horaFimComDeslocamento}
                      </div>`
              )
              .join('');

      html += `
        <div data-client-day="${isoDay}"
          class="min-h-[108px] p-3 rounded-xl border bg-white border-slate-200 hover:border-amber-600 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group">
          <div class="flex items-center justify-between">
            <span class="text-base font-extrabold text-slate-900 group-hover:text-amber-600">${pad2(d)}</span>
            <span class="text-xs font-bold text-amber-700 opacity-0 group-hover:opacity-100 transition">Agendar +</span>
          </div>
          <div class="space-y-1.5 mt-2">${badges}</div>
        </div>`;
    }

    grid.innerHTML = html;
    grid.querySelectorAll('[data-client-day]').forEach(cell => {
      cell.addEventListener('click', () => {
        openWizardForDate(cell.getAttribute('data-client-day'));
      });
    });
  }

  function openWizardForDate(isoDay) {
    const [yy, mm, dd] = isoDay.split('-').map(Number);
    setText('wizardSelectedDateLabel', `${pad2(dd)}/${pad2(mm)}/${yy}`);

    const dayBusy = getAllVisits().filter(v => {
      if (v.status === 'cancelado') return false;
      const dt = new Date(v.sugestao1ISO);
      return dt.getFullYear() === yy && dt.getMonth() + 1 === mm && dt.getDate() === dd;
    });

    const busyEl = document.getElementById('wizardDayBusySlotsList');
    if (busyEl) {
      busyEl.innerHTML =
        dayBusy.length === 0
          ? `<span class="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-bold">🟢 Todos os horários livres neste dia para visita/avaliação!</span>`
          : dayBusy
              .map(
                v =>
                  `<span class="px-3 py-1.5 rounded-lg bg-rose-100 border border-rose-200 text-rose-800 text-sm font-bold">🔴 Ocupado: ${v.horaInicio} às ${v.horaFimComDeslocamento}</span>`
              )
              .join('');
    }

    const s1 = document.getElementById('inputSugestao1');
    const s2 = document.getElementById('inputSugestao2');
    if (s1) s1.value = `${isoDay}T09:00`;
    if (s2) s2.value = `${isoDay}T14:30`;

    document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
    document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
    populateClientCatalog();
    renderChips();
    setWizardStep(1);
    document.getElementById('modalClientWizard')?.classList.remove('hidden');
  }

  function setWizardStep(step) {
    currentWizardStep = step;
    ['1', '2', '3', 'SuccessFinal'].forEach((s, idx) => {
      const el = document.getElementById(`wizardPage${s}`);
      if (el) el.classList.toggle('hidden', step !== idx + 1);
    });

    const header = document.getElementById('wizardHeaderBar');
    if (step === 4) {
      header?.classList.add('hidden');
      return;
    }
    header?.classList.remove('hidden');

    const map = {
      1: { badge: 'Página 1 de 3', title: '1. Dia e Horário para Visita / Orçamento' },
      2: { badge: 'Página 2 de 3', title: '2. Serviços de Pintura / Reforma Desejados' },
      3: { badge: 'Página 3 de 3', title: '3. Seu Nome, Endereço/Bairro e WhatsApp' }
    };
    setText('wizardStepBadge', map[step].badge);
    setText('wizardStepTitle', map[step].title);

    [1, 2, 3].forEach(n => {
      const p = document.getElementById(`wizProg${n}`);
      if (p) p.className = `h-2 rounded-full transition-all ${step >= n ? 'bg-amber-600' : 'bg-slate-200'}`;
    });
  }

  function populateClientCatalog() {
    const services = parseServices();
    const sel = document.getElementById('selectServiceCatalog');
    if (sel) {
      sel.innerHTML = services
        .map(s => `<option value="${escapeHtml(s.codigo)}">${escapeHtml(s.nome.split('(')[0].trim())}</option>`)
        .join('');
    }

    const quick = document.getElementById('quickServicesContainer');
    if (quick) {
      quick.innerHTML = services
        .map(s => {
          const isSel = selectedServiceCodes.includes(s.codigo);
          const shortName = s.nome.split('(')[0].trim();
          return `<button type="button" data-quick="${escapeHtml(s.codigo)}"
            class="text-sm px-3.5 py-2 rounded-xl border transition-all ${
              isSel
                ? 'bg-amber-600 border-amber-600 text-white font-bold shadow-sm'
                : 'bg-white border-slate-300 text-slate-700 hover:border-amber-600 hover:text-amber-700 font-medium'
            }">
            ${isSel ? '✓ ' : '+ '}${escapeHtml(shortName)}
          </button>`;
        })
        .join('');

      quick.querySelectorAll('[data-quick]').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-quick');
          if (selectedServiceCodes.includes(code)) {
            selectedServiceCodes = selectedServiceCodes.filter(c => c !== code);
          } else {
            selectedServiceCodes.push(code);
          }
          syncTextarea();
          populateClientCatalog();
          renderChips();
        });
      });
    }
  }

  function addServiceCode(code) {
    if (!selectedServiceCodes.includes(code)) selectedServiceCodes.push(code);
    syncTextarea();
    populateClientCatalog();
    renderChips();
  }

  function syncTextarea() {
    const ta = document.getElementById('inputDescricaoChamado');
    if (ta) ta.value = buildDescriptionWithServices(selectedServiceCodes, ta.value);
  }

  function renderChips() {
    const box = document.getElementById('selectedServicesChips');
    if (!box) return;
    const all = parseServices();
    if (selectedServiceCodes.length === 0) {
      box.innerHTML = `<span class="text-sm text-slate-500">Nenhum serviço marcado ainda. Clique nos botões acima para montar seu pedido.</span>`;
      return;
    }
    box.innerHTML = selectedServiceCodes
      .map(code => {
        const s = all.find(x => x.codigo === code);
        if (!s) return '';
        return `<span class="animate-chip inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-sm font-bold">
          <span>🧱 ${escapeHtml(s.nome.split('(')[0].trim())}</span>
          <button type="button" data-rm="${escapeHtml(s.codigo)}" class="text-amber-700 hover:text-rose-600 font-extrabold ml-1">✕</button>
        </span>`;
      })
      .join('');

    box.querySelectorAll('[data-rm]').forEach(b => {
      b.addEventListener('click', () => {
        selectedServiceCodes = selectedServiceCodes.filter(c => c !== b.getAttribute('data-rm'));
        syncTextarea();
        populateClientCatalog();
        renderChips();
      });
    });
  }

  function handlePreConclude() {
    const s1 = document.getElementById('inputSugestao1')?.value;
    const nome = document.getElementById('inputNomeCliente')?.value.trim();
    const wa = document.getElementById('inputWhatsapp')?.value.trim();
    const end = document.getElementById('inputEnderecoObra')?.value.trim();

    if (!s1) {
      setWizardStep(1);
      showToast('Informe o dia e horário.', 'rose');
      return;
    }
    if (String(wa || '').replace(/\D/g, '').length < 10) {
      showToast('Informe seu WhatsApp com DDD.', 'rose');
      document.getElementById('inputWhatsapp')?.focus();
      return;
    }
    if (!nome) {
      showToast('Informe seu nome.', 'rose');
      document.getElementById('inputNomeCliente')?.focus();
      return;
    }
    if (!end) {
      showToast('Informe o bairro ou endereço da obra/imóvel.', 'rose');
      document.getElementById('inputEnderecoObra')?.focus();
      return;
    }

    const fmtS1 = formatDateTimeBR(new Date(s1).toISOString());
    setText('wizardConfirmSummaryText', `Cliente: ${nome} (${wa}) | Local: ${end} | Visita solicitada para: ${fmtS1}.`);
    document.getElementById('wizardStep3FooterBtns')?.classList.add('hidden');
    document.getElementById('wizardConfirmPromptBox')?.classList.remove('hidden');
  }

  function handleFinalConfirmAndSend() {
    const tipoImovel = document.getElementById('selectTipoImovel')?.value || 'Casa Residencial';
    const nomeCliente = document.getElementById('inputNomeCliente')?.value.trim();
    const whatsapp = document.getElementById('inputWhatsapp')?.value.trim();
    const enderecoObra = document.getElementById('inputEnderecoObra')?.value.trim();
    const s1Val = document.getElementById('inputSugestao1')?.value;
    const s2Val = document.getElementById('inputSugestao2')?.value;
    const descricao = document.getElementById('inputDescricaoChamado')?.value.trim();

    const summary = calculateSummary(selectedServiceCodes);
    const created = addVisit({
      tipoImovel,
      nomeCliente,
      whatsapp,
      enderecoObra,
      servicosCodigos: summary.codigos,
      servicosNomes: summary.nomes,
      descricao: descricao || buildDescriptionWithServices(selectedServiceCodes, 'Pedido de orçamento no local.'),
      sugestao1ISO: new Date(s1Val).toISOString(),
      sugestao2ISO: s2Val ? new Date(s2Val).toISOString() : '',
      valorEstimado: summary.valorTotal
    });
    lastCreatedVisit = created;

    const cfg = loadCloudConfig();
    const rawDest = String(cfg.whatsappProfissional || '').replace(/\D/g, '');
    const destPhone = rawDest ? (rawDest.startsWith('55') ? rawDest : `55${rawDest}`) : '';

    const msg = [
      `🧱 *NOVO PEDIDO DE VISITA / ORÇAMENTO (${created.id})*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Cliente:* ${created.nomeCliente}`,
      `📱 *WhatsApp:* ${created.whatsapp}`,
      `🏠 *Tipo de Imóvel:* ${created.tipoImovel}`,
      `📍 *Endereço / Local:* ${created.enderecoObra}`,
      `🗺️ *Mapa (iPhone/Waze):* https://maps.apple.com/?q=${encodeURIComponent(created.enderecoObra)}`,
      `🗓️ *Data e Hora Sugerida:* ${created.sugestao1Formatada}`,
      `🔄 *2ª Opção:* ${created.sugestao2Formatada}`,
      ``,
      `🛠️ *Serviços Solicitados:*`,
      `${created.descricao}`
    ].join('\n');

    const waUrl = destPhone
      ? `https://wa.me/${destPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');

    renderClientCalendar();
    setText(
      'finalSentMessageText',
      `Seu pedido de orçamento ${created.id} (${created.nomeCliente} — ${created.enderecoObra}) para ${created.sugestao1Formatada} foi registrado e enviado com sucesso!`
    );
    setWizardStep(4);
  }

  /* ==========================================================================
     PAINEL DO PROFISSIONAL (AGENDA + GERADOR DE ORÇAMENTO E RECIBO EM PDF)
     ========================================================================== */
  function renderAdminTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      const t = btn.getAttribute('data-admin-tab');
      if (t === activeAdminTab) {
        btn.classList.add('bg-amber-600', 'text-white', 'shadow-sm');
        btn.classList.remove('bg-slate-100', 'text-slate-700');
      } else {
        btn.classList.remove('bg-amber-600', 'text-white', 'shadow-sm');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      }
    });

    ['calendario', 'orcamento', 'catalogo', 'seguranca'].forEach(id => {
      document.getElementById(`adminTab_${id}`)?.classList.toggle('hidden', id !== activeAdminTab);
    });

    if (activeAdminTab === 'calendario') renderAdminCalendarAndList();
    else if (activeAdminTab === 'orcamento') populateQuoteBuilderTab();
    else if (activeAdminTab === 'catalogo') renderCatalogAdminTab();
    else if (activeAdminTab === 'seguranca') renderSecurityAdminTab();
  }

  function renderAdminCalendarAndList() {
    const visits = getAllVisits();
    const year = adminCalDate.getFullYear();
    const month = adminCalDate.getMonth();

    const pending = visits.filter(v => v.status === 'pendente').length;
    const confirmed = visits.filter(v => v.status === 'confirmado' || v.status === 'concluido');
    const totalEst = confirmed.reduce((acc, v) => acc + (Number(v.valorEstimado) || 0), 0);

    setText('statPendingCount', String(pending));
    setText('statConfirmedCount', String(confirmed.length));
    setText('statRevenueMonth', formatCurrencyBR(totalEst));
    setText('calendarMonthTitle', `${MESES[month]} de ${year}`);

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('calendarGridCells');
    if (grid) {
      let html = '';
      for (let i = 0; i < firstDay; i++) {
        html += `<div class="min-h-[88px] rounded-xl bg-slate-50 border border-slate-100"></div>`;
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const isoDay = `${year}-${pad2(month + 1)}-${pad2(d)}`;
        const dayVisits = visits.filter(v => {
          const dt = new Date(v.sugestao1ISO);
          return dt.getFullYear() === year && dt.getMonth() === month && dt.getDate() === d;
        });

        const badges = dayVisits
          .map(
            v =>
              `<div class="text-xs font-semibold truncate px-1.5 py-0.5 rounded border ${
                v.status === 'pendente'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }">${v.horaInicio} ${escapeHtml(v.nomeCliente.split(' ')[0])}</div>`
          )
          .join('');

        html += `
          <div data-adm-day="${isoDay}" class="min-h-[88px] p-2 rounded-xl border bg-white border-slate-200 hover:border-amber-600 cursor-pointer flex flex-col justify-between">
            <span class="text-sm font-bold text-slate-800">${pad2(d)}</span>
            <div class="space-y-1 mt-1">${badges}</div>
          </div>`;
      }
      grid.innerHTML = html;
    }

    const listEl = document.getElementById('adminTicketsListContainer');
    if (listEl) {
      listEl.innerHTML = visits
        .map(
          v => `
        <div class="corp-card p-5 space-y-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-xs font-mono font-bold text-amber-700">${escapeHtml(v.id)}</span>
              <span class="ml-2 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                v.status === 'pendente' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
              }">${v.status === 'pendente' ? '⏳ Aguardando Visita' : '✅ Confirmado / Em Obra'}</span>
              <h4 class="text-base font-extrabold text-slate-900 mt-1">👤 ${escapeHtml(v.nomeCliente)} — 📱 ${escapeHtml(v.whatsapp)}</h4>
              <p class="text-sm text-slate-600">📍 ${escapeHtml(v.tipoImovel)}: ${escapeHtml(v.enderecoObra)}</p>
            </div>
            <div class="text-right">
              <span class="text-xs text-slate-500 block">Valor Mão de Obra (R$)</span>
              <input type="number" step="50" value="${Number(v.valorEstimado).toFixed(2)}" data-val-id="${escapeHtml(v.id)}"
                class="w-28 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right text-sm font-extrabold text-emerald-700 mt-1" />
            </div>
          </div>

          <div class="text-sm bg-slate-50 p-3 rounded-xl border border-slate-200">
            <strong>🗓️ Visita:</strong> ${escapeHtml(v.sugestao1Formatada)} (reservado até ${v.horaFimComDeslocamento} c/ deslocamento)
          </div>

          <pre class="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-200 font-sans">${escapeHtml(
            v.descricao
          )}</pre>

          <div class="flex flex-wrap gap-2 pt-1">
            <button type="button" data-act="confirm" data-id="${escapeHtml(v.id)}" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
              ✓ Confirmar Visita
            </button>
            <button type="button" data-act="ics" data-id="${escapeHtml(v.id)}" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5">
              🍎 Agenda iPhone (.ics)
            </button>
            <button type="button" data-act="wa" data-id="${escapeHtml(v.id)}" class="px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold">
              💬 Chamar Cliente no WhatsApp
            </button>
            <button type="button" data-act="quote" data-id="${escapeHtml(v.id)}" class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">
              📄 Emitir Orçamento / Recibo PDF
            </button>
            <button type="button" data-act="del" data-id="${escapeHtml(v.id)}" class="ml-auto px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              🗑️ Excluir
            </button>
          </div>
        </div>`
        )
        .join('');

      listEl.querySelectorAll('[data-val-id]').forEach(inp => {
        inp.addEventListener('change', e => {
          const id = inp.getAttribute('data-val-id');
          const all = getAllVisits().map(x => (x.id === id ? { ...x, valorEstimado: Number(e.target.value) || 0 } : x));
          saveAllVisits(all);
          renderAdminCalendarAndList();
          showToast('Valor atualizado!', 'emerald');
        });
      });

      listEl.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const act = btn.getAttribute('data-act');
          const all = getAllVisits();
          const item = all.find(x => x.id === id);
          if (!item) return;

          if (act === 'confirm') {
            item.status = 'confirmado';
            saveAllVisits(all);
            renderAdminCalendarAndList();
            showToast(`Visita ${id} confirmada na agenda!`, 'emerald');
          } else if (act === 'ics') {
            downloadOrOpenIcs(item);
          } else if (act === 'wa') {
            const digits = String(item.whatsapp || '').replace(/\D/g, '');
            const phone = digits.startsWith('55') ? digits : `55${digits}`;
            const msg = `Olá, *${item.nomeCliente}*! Aqui é do *David Reformas*. Tudo certo para nossa visita técnica/avaliação no dia *${item.sugestao1Formatada}* no endereço *${item.enderecoObra}*?`;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
          } else if (act === 'quote') {
            activeAdminTab = 'orcamento';
            renderAdminTabs();
            const sel = document.getElementById('quoteSelectVisit');
            if (sel) {
              sel.value = item.id;
              handleQuoteSelectVisitChange();
            }
          } else if (act === 'del') {
            saveAllVisits(all.filter(x => x.id !== id));
            renderAdminCalendarAndList();
            showToast('Registro removido.', 'slate');
          }
        });
      });
    }
  }

  /* ==========================================================================
     GERADOR DE ORÇAMENTO E RECIBO EM PDF (DIFERENCIAL COMERCIAL DAVID REFORMAS)
     ========================================================================== */
  function populateQuoteBuilderTab() {
    const visits = getAllVisits();
    const sel = document.getElementById('quoteSelectVisit');
    if (sel) {
      sel.innerHTML =
        `<option value="">-- Selecionar cliente agendado ou preencher manualmente --</option>` +
        visits
          .map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.id)} — ${escapeHtml(v.nomeCliente)} (${escapeHtml(v.enderecoObra)})</option>`)
          .join('');
    }
    if (visits[0] && !document.getElementById('quoteClientName')?.value) {
      fillQuoteFieldsFromVisit(visits[0]);
    }
  }

  function handleQuoteSelectVisitChange() {
    const id = document.getElementById('quoteSelectVisit')?.value;
    const found = getAllVisits().find(v => v.id === id);
    if (found) fillQuoteFieldsFromVisit(found);
  }

  function fillQuoteFieldsFromVisit(v) {
    document.getElementById('quoteClientName').value = v.nomeCliente || '';
    document.getElementById('quoteClientPhone').value = v.whatsapp || '';
    document.getElementById('quoteClientAddress').value = `${v.tipoImovel} — ${v.enderecoObra}`;
    document.getElementById('quoteDescription').value = v.descricao || '';
    document.getElementById('quoteTotalValue').value = Number(v.valorEstimado || 0).toFixed(2);
    document.getElementById('quoteTimeline').value = v.prazoObra || '5 dias úteis';
    document.getElementById('quotePaymentTerms').value =
      v.condicaoPagamento || '50% no início da obra e 50% na entrega dos serviços';
  }

  function getQuoteFormData() {
    const cfg = loadCloudConfig();
    return {
      profissionalNome: cfg.profissionalNome || 'David Reformas — Pintura, Alvenaria & Acabamentos',
      profissionalWhatsApp: cfg.whatsappProfissional || 'Atendimento Especializado',
      chavePix: cfg.chavePix || 'A combinar com o profissional',
      clienteNome: document.getElementById('quoteClientName')?.value.trim() || 'Cliente',
      clienteWhatsapp: document.getElementById('quoteClientPhone')?.value.trim() || '',
      enderecoObra: document.getElementById('quoteClientAddress')?.value.trim() || '',
      descricaoServicos: document.getElementById('quoteDescription')?.value.trim() || '',
      valorTotal: Number(document.getElementById('quoteTotalValue')?.value) || 0,
      prazoExecucao: document.getElementById('quoteTimeline')?.value.trim() || 'A combinar',
      condicaoPagamento: document.getElementById('quotePaymentTerms')?.value.trim() || 'A combinar',
      dataEmissao: formatDateBR(new Date())
    };
  }

  function openPrintableDocument(docType) {
    const data = getQuoteFormData();
    const isRecibo = docType === 'RECIBO';
    const docTitle = isRecibo ? 'RECIBO DE PAGAMENTO DE SERVIÇOS' : 'ORÇAMENTO TÉCNICO DE MÃO DE OBRA';
    const badgeColor = isRecibo ? '#059669' : '#d97706';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} - ${data.clienteNome} - David Reformas</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; background: #f1f5f9; margin: 0; padding: 24px; }
    .page { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${badgeColor}; padding-bottom: 20px; margin-bottom: 24px; }
    .badge { display: inline-block; background: ${badgeColor}; color: #fff; padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: 0.05em; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .total-box { background: #0f172a; color: #fff; border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; align-items: center; margin: 24px 0; }
    .disclaimer { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 14px 18px; border-radius: 10px; font-size: 13px; line-height: 1.5; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 56px; text-align: center; }
    .sig-line { border-top: 1px solid #475569; padding-top: 8px; font-size: 14px; font-weight: 600; }
    .btn-bar { max-width: 860px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; }
    .btn { background: ${badgeColor}; color: #fff; border: none; padding: 12px 22px; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 14px; }
    @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; padding: 0; } .btn-bar { display: none; } }
  </style>
</head>
<body>
  <div class="btn-bar">
    <button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar em PDF para Enviar no WhatsApp</button>
  </div>
  <div class="page">
    <div class="header">
      <div>
        <span class="badge">${docTitle}</span>
        <h1 style="margin:10px 0 4px 0;font-size:26px;">🧱 ${data.profissionalNome}</h1>
        <p style="margin:0;color:#475569;font-size:14px;">Pintura Residencial e Comercial • Alvenaria • Pisos & Porcelanatos • Reformas</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:13px;color:#64748b;">Data de Emissão</p>
        <p style="margin:4px 0 0 0;font-size:18px;font-weight:800;">${data.dataEmissao}</p>
      </div>
    </div>

    <div class="box">
      <h3 style="margin:0 0 10px 0;font-size:15px;color:#334155;text-transform:uppercase;">Dados do Cliente & Local da Obra</h3>
      <p style="margin:4px 0;font-size:15px;"><strong>Cliente:</strong> ${data.clienteNome} ${data.clienteWhatsapp ? '(' + data.clienteWhatsapp + ')' : ''}</p>
      <p style="margin:4px 0;font-size:15px;"><strong>Local / Imóvel:</strong> ${data.enderecoObra}</p>
    </div>

    <div class="box">
      <h3 style="margin:0 0 10px 0;font-size:15px;color:#334155;text-transform:uppercase;">${
        isRecibo ? 'Referente aos Serviços Executados' : 'Descrição Detalhada dos Serviços (Mão de Obra)'
      }</h3>
      <pre style="margin:0;white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.6;color:#1e293b;">${data.descricaoServicos}</pre>
    </div>

    <div class="box" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <strong style="font-size:13px;color:#64748b;text-transform:uppercase;display:block;">Prazo Estimado de Execução</strong>
        <span style="font-size:16px;font-weight:700;color:#0f172a;">${data.prazoExecucao}</span>
      </div>
      <div>
        <strong style="font-size:13px;color:#64748b;text-transform:uppercase;display:block;">Condições de Pagamento / PIX</strong>
        <span style="font-size:15px;font-weight:700;color:#0f172a;">${data.condicaoPagamento}</span>
        ${data.chavePix ? `<br><span style="font-size:13px;color:#475569;">PIX: ${data.chavePix}</span>` : ''}
      </div>
    </div>

    <div class="total-box">
      <div>
        <span style="font-size:13px;text-transform:uppercase;opacity:0.85;">${
          isRecibo ? 'Valor Total Recebido' : 'Valor Total da Mão de Obra'
        }</span>
        <div style="font-size:13px;opacity:0.8;margin-top:2px;">${
          isRecibo ? 'Damos plena quitação pelo valor acima discriminado.' : 'Orçamento válido por 15 dias.'
        }</div>
      </div>
      <div style="font-size:30px;font-weight:900;color:#fbbf24;">
        ${formatCurrencyBR(data.valorTotal)}
      </div>
    </div>

    <div class="disclaimer">
      <strong>⚖️ Observação sobre Materiais e Tintas:</strong> Os valores acima referem-se exclusivamente à mão de obra técnica de execução dos serviços descritos. Tintas, massas, lixas, argamassas, pisos e demais materiais de construção são fornecidos pelo cliente contratante.
    </div>

    <div class="signatures">
      <div class="sig-line">${data.profissionalNome}</div>
      <div class="sig-line">${data.clienteNome} (Contratante)</div>
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    }
  }

  function sendQuoteViaWhatsApp() {
    const data = getQuoteFormData();
    const digits = String(data.clienteWhatsapp || '').replace(/\D/g, '');
    const phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';

    const msg = [
      `🧱 *ORÇAMENTO TÉCNICO — DAVID REFORMAS*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Cliente:* ${data.clienteNome}`,
      `📍 *Local da Obra:* ${data.enderecoObra}`,
      `📅 *Data:* ${data.dataEmissao}`,
      ``,
      `🛠️ *Serviços Incluídos (Mão de Obra):*`,
      `${data.descricaoServicos}`,
      ``,
      `⏱️ *Prazo Estimado:* ${data.prazoExecucao}`,
      `💳 *Forma de Pagamento:* ${data.condicaoPagamento}`,
      `💰 *Valor Total da Mão de Obra:* *${formatCurrencyBR(data.valorTotal)}*`,
      ``,
      `_Obs: Tintas, revestimentos e materiais são fornecidos pelo contratante._`
    ].join('\n');

    const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  function renderCatalogAdminTab() {
    const services = parseServices();
    const tbody = document.getElementById('adminServicesTableBody');
    if (!tbody) return;

    tbody.innerHTML = services
      .map(
        (s, idx) => `
      <tr class="border-b border-slate-200">
        <td class="py-2.5 px-3 text-xs font-mono font-bold text-amber-700">${escapeHtml(s.codigo)}</td>
        <td class="py-2.5 px-3 text-sm font-semibold text-slate-900">${escapeHtml(s.nome)}</td>
        <td class="py-2.5 px-3 text-sm text-slate-600">${escapeHtml(s.categoria)}</td>
        <td class="py-2.5 px-3 text-sm text-right">
          R$ <input type="number" step="20" value="${Number(s.valorBase).toFixed(2)}" data-srv-idx="${idx}"
            class="w-28 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right text-emerald-700 font-bold text-sm" />
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-srv-idx]').forEach(inp => {
      inp.addEventListener('change', () => {
        const list = parseServices();
        tbody.querySelectorAll('[data-srv-idx]').forEach(el => {
          const i = Number(el.getAttribute('data-srv-idx'));
          if (list[i]) list[i].valorBase = Number(el.value) || 0;
        });
        setServicesCsvRaw(serializeServices(list));
        showToast('Tabela de valores base atualizada!', 'emerald');
      });
    });
  }

  function renderSecurityAdminTab() {
    const cfg = loadCloudConfig();
    if (document.getElementById('cfgProfNome')) document.getElementById('cfgProfNome').value = cfg.profissionalNome || 'David Reformas — Pintura & Construção';
    if (document.getElementById('cfgOwnerWhatsapp')) document.getElementById('cfgOwnerWhatsapp').value = cfg.whatsappProfissional || '';
    if (document.getElementById('cfgOwnerEmail')) document.getElementById('cfgOwnerEmail').value = cfg.emailIcloud || cfg.emailGoogle || '';
    if (document.getElementById('cfgPixKey')) document.getElementById('cfgPixKey').value = cfg.chavePix || '';
  }

  function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, color = 'amber') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const palette = {
      emerald: 'bg-emerald-700 border-emerald-800 text-white',
      rose: 'bg-rose-700 border-rose-800 text-white',
      amber: 'bg-amber-600 border-amber-700 text-white',
      slate: 'bg-slate-800 border-slate-900 text-white'
    };
    const toast = document.createElement('div');
    toast.className = `animate-spring-up px-5 py-3.5 rounded-xl border shadow-lg text-sm font-bold flex items-center gap-2.5 ${
      palette[color] || palette.amber
    }`;
    toast.innerHTML = `<span>✔️</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  DavidReformasApp.init();
});
