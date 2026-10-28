/**
 * ============================================================================
 * MOTOR DE AGENDAMENTO, SUGESTÕES DE HORÁRIO E RESERVA DE 15 MINUTOS
 * ============================================================================
 * - Calcula sempre +15 minutos de reserva técnica entre um cliente e outro.
 * - Verifica colisões de horário considerando a janela de atendimento + reserva.
 * - Gerencia os chamados (Pendentes de confirmação, Confirmados/Aceitos, Concluídos).
 */

const SchedulerManager = (() => {
  const STORAGE_KEY_TICKETS = 'diacov_tickets_db_v1';
  const BUFFER_MINUTES = 15;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateBR(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj)) return '-';
    return `${pad2(dateObj.getDate())}/${pad2(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
  }

  function formatTimeBR(dateObj) {
    if (!(dateObj instanceof Date) || isNaN(dateObj)) return '--:--';
    return `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;
  }

  function formatDateTimeBR(isoString) {
    if (!isoString) return 'Não informado';
    const dt = new Date(isoString);
    if (isNaN(dt)) return isoString;
    return `${formatDateBR(dt)} às ${formatTimeBR(dt)}`;
  }

  /**
   * Calcula o término do atendimento e o término incluindo os 15 minutos de reserva
   */
  function calculateWindowWithBuffer(startIso, durationMinutes) {
    const start = new Date(startIso);
    const dur = Number(durationMinutes) || 40;
    const endService = new Date(start.getTime() + dur * 60000);
    const endWithBuffer = new Date(endService.getTime() + BUFFER_MINUTES * 60000);

    return {
      startIso: start.toISOString(),
      endServiceIso: endService.toISOString(),
      endWithBufferIso: endWithBuffer.toISOString(),
      dataBR: formatDateBR(start),
      horaInicio: formatTimeBR(start),
      horaFimServico: formatTimeBR(endService),
      horaFimComReserva: formatTimeBR(endWithBuffer),
      duracaoMinutos: dur,
      reservaMinutos: BUFFER_MINUTES,
      janelaTotalMinutos: dur + BUFFER_MINUTES
    };
  }

  /**
   * Verifica se uma nova janela colide com chamados já confirmados (incluindo os 15 min de reserva)
   */
  function checkScheduleConflict(startIso, durationMinutes, ignoreTicketId = null) {
    const candidate = calculateWindowWithBuffer(startIso, durationMinutes);
    const candStart = new Date(candidate.startIso).getTime();
    const candEnd = new Date(candidate.endWithBufferIso).getTime();

    const tickets = getAllTickets();
    for (const t of tickets) {
      if (t.id === ignoreTicketId) continue;
      if (t.status === 'cancelado') continue;

      const existingWin = calculateWindowWithBuffer(t.sugestao1ISO, t.duracaoMinutos);
      const exStart = new Date(existingWin.startIso).getTime();
      const exEnd = new Date(existingWin.endWithBufferIso).getTime();

      if (candStart < exEnd && candEnd > exStart) {
        return {
          hasConflict: true,
          conflictingTicket: t,
          message: `Conflito com atendimento de ${t.nomeCliente} (${t.empresa}) das ${existingWin.horaInicio} às ${existingWin.horaFimComReserva} (já inclui 15m de reserva).`
        };
      }
    }

    return { hasConflict: false };
  }

  /**
   * Gera dados de demonstração iniciais no mês atual para visualização imediata no calendário
   */
  function createInitialSeedTickets() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const makeIso = (day, hour, min) => {
      const maxDay = new Date(y, m + 1, 0).getDate();
      const safeDay = Math.min(day, maxDay);
      return new Date(y, m, safeDay, hour, min, 0).toISOString();
    };

    const seed = [
      {
        id: 'CHM-1001',
        empresa: 'RFranco Engenharia',
        nomeCliente: 'Carlos Eduardo (Projetos)',
        whatsapp: '(11) 98765-4321',
        ferramentaRemota: 'AnyDesk',
        idRemoto: '482 910 334',
        servicosCodigos: ['SRV-10', 'SRV-02'],
        servicosNomes: [
          'Autodesk Revit (Instalação Completa + Bibliotecas/Templates BIM e Ativação)',
          'Configuração de E-mail Corporativo (Outlook / Webmail) + Assinatura'
        ],
        descricao:
          'Serviços remotos solicitados:\n• 1. [Instalação BIM] Autodesk Revit (instalação completa com bibliotecas/templates e ativação com licença do cliente)\n• 2. [Configuração de E-mail] Conta corporativa no Outlook/Webmail incluindo padronização de assinatura\n\nObservações adicionais do cliente:\nEstação nova do setor de cálculo estrutural.',
        sugestao1ISO: makeIso(Math.max(1, now.getDate() - 2), 9, 0),
        sugestao2ISO: makeIso(Math.max(1, now.getDate() - 2), 14, 0),
        duracaoMinutos: 95,
        valorCalculado: 205.0,
        status: 'concluido',
        criadoEm: new Date().toISOString()
      },
      {
        id: 'CHM-1002',
        empresa: 'RFranco Engenharia',
        nomeCliente: 'Fernanda Lima (Arquitetura)',
        whatsapp: '(11) 97654-3210',
        ferramentaRemota: 'AnyDesk',
        idRemoto: '918 220 115',
        servicosCodigos: ['SRV-09'],
        servicosNomes: ['Autodesk AutoCAD (Instalação Completa, Plotters/Idioma e Ativação)'],
        descricao:
          'Serviços remotos solicitados:\n• 1. [Instalação Engenharia] Autodesk AutoCAD (configuração completa e ativação com licença do cliente)\n\nObservações adicionais do cliente:\nPreciso das penas CTB da RFranco configuradas.',
        sugestao1ISO: makeIso(now.getDate(), 10, 0),
        sugestao2ISO: makeIso(now.getDate(), 15, 30),
        duracaoMinutos: 60,
        valorCalculado: 120.0,
        status: 'confirmado',
        criadoEm: new Date().toISOString()
      },
      {
        id: 'CHM-1003',
        empresa: 'Eleva Andaimes',
        nomeCliente: 'Roberto Mendes (Comercial)',
        whatsapp: '(11) 96543-2109',
        ferramentaRemota: 'TeamViewer',
        idRemoto: '1 402 889 120',
        servicosCodigos: ['SRV-05', 'SRV-01'],
        servicosNomes: [
          'Pacote Microsoft Office (Word, Excel, PowerPoint, Outlook - Instalar/Reinstalar)',
          'Adobe Acrobat Reader / Utilitários Básicos (WinRAR, 7-Zip, Navegadores)'
        ],
        descricao:
          'Serviços remotos solicitados:\n• 1. [Instalação/Reinstalação] Pacote Microsoft Office (Word, Excel, PowerPoint e Outlook) com licença do cliente\n• 2. [Instalação/Configuração] Adobe Acrobat Reader e utilitários essenciais do sistema\n\nObservações adicionais do cliente:\nNotebook formatado recentemente.',
        sugestao1ISO: makeIso(now.getDate(), 14, 0),
        sugestao2ISO: makeIso(now.getDate(), 16, 0),
        duracaoMinutos: 55,
        valorCalculado: 115.0,
        status: 'pendente',
        criadoEm: new Date().toISOString()
      }
    ];

    return seed.map(enrichTicketWindow);
  }

  function enrichTicketWindow(ticket) {
    const win = calculateWindowWithBuffer(ticket.sugestao1ISO, ticket.duracaoMinutos);
    return {
      ...ticket,
      dataBR: win.dataBR,
      horaInicio: win.horaInicio,
      horaFimServico: win.horaFimServico,
      horaFimComReserva: win.horaFimComReserva,
      reservaMinutos: BUFFER_MINUTES,
      sugestao1Formatada: formatDateTimeBR(ticket.sugestao1ISO),
      sugestao2Formatada: ticket.sugestao2ISO ? formatDateTimeBR(ticket.sugestao2ISO) : 'Não informada'
    };
  }

  function getAllTickets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TICKETS);
      if (!raw) {
        const seed = createInitialSeedTickets();
        localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(seed));
        return seed;
      }
      const parsed = JSON.parse(raw);
      return (parsed || []).map(enrichTicketWindow);
    } catch (e) {
      return [];
    }
  }

  function saveAllTickets(ticketsList) {
    const enriched = (ticketsList || []).map(enrichTicketWindow);
    localStorage.setItem(STORAGE_KEY_TICKETS, JSON.stringify(enriched));
    return enriched;
  }

  function addTicket(ticketData) {
    const all = getAllTickets();
    const nextNum = 1001 + all.length;
    const newTicket = enrichTicketWindow({
      id: `CHM-${nextNum}`,
      empresa: ticketData.empresa,
      nomeCliente: ticketData.nomeCliente,
      whatsapp: ticketData.whatsapp,
      ferramentaRemota: ticketData.ferramentaRemota || 'AnyDesk',
      idRemoto: ticketData.idRemoto || '',
      servicosCodigos: ticketData.servicosCodigos || [],
      servicosNomes: ticketData.servicosNomes || [],
      descricao: ticketData.descricao || '',
      sugestao1ISO: ticketData.sugestao1ISO,
      sugestao2ISO: ticketData.sugestao2ISO || '',
      duracaoMinutos: Number(ticketData.duracaoMinutos) || 40,
      valorCalculado: Number(ticketData.valorCalculado) || 65,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    });

    all.unshift(newTicket);
    saveAllTickets(all);
    return newTicket;
  }

  function updateTicketStatus(ticketId, newStatus, useSecondSuggestion = false) {
    const all = getAllTickets();
    const updated = all.map(t => {
      if (t.id !== ticketId) return t;
      const chosenIso = useSecondSuggestion && t.sugestao2ISO ? t.sugestao2ISO : t.sugestao1ISO;
      return enrichTicketWindow({
        ...t,
        sugestao1ISO: chosenIso,
        status: newStatus
      });
    });
    saveAllTickets(updated);
    return updated.find(t => t.id === ticketId);
  }

  function updateTicketPrice(ticketId, newPrice) {
    const all = getAllTickets();
    const updated = all.map(t => {
      if (t.id !== ticketId) return t;
      return { ...t, valorCalculado: Number(newPrice) || 0 };
    });
    saveAllTickets(updated);
    return updated.find(t => t.id === ticketId);
  }

  function deleteTicket(ticketId) {
    const all = getAllTickets().filter(t => t.id !== ticketId);
    saveAllTickets(all);
    return all;
  }

  return {
    BUFFER_MINUTES,
    formatDateBR,
    formatTimeBR,
    formatDateTimeBR,
    calculateWindowWithBuffer,
    checkScheduleConflict,
    getAllTickets,
    saveAllTickets,
    addTicket,
    updateTicketStatus,
    updateTicketPrice,
    deleteTicket
  };
})();
