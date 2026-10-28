/**
 * ============================================================================
 * INTEGRAÇÃO SEGURA COM GOOGLE WORKSPACE (CALENDAR + DRIVE CSV + PLANILHA 12 MESES)
 * ============================================================================
 */

const GoogleIntegration = (() => {
  function toGoogleCalendarUTCString(isoString) {
    const dt = new Date(isoString);
    return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  /**
   * Gera Link Oficial de Convite do Google Agenda (abre direto no App do Celular ou Web)
   * incluindo os 15 minutos de reserva técnica
   */
  function generateGoogleCalendarInviteUrl(ticket, useSecondOption = false) {
    const cfg = SecurityManager.loadCloudConfig();
    const ownerEmail = cfg.ownerEmail || '';
    const chosenIso = useSecondOption && ticket.sugestao2ISO ? ticket.sugestao2ISO : ticket.sugestao1ISO;

    const win = SchedulerManager.calculateWindowWithBuffer(chosenIso, ticket.duracaoMinutos);
    const startUTC = toGoogleCalendarUTCString(win.startIso);
    const endUTC = toGoogleCalendarUTCString(win.endWithBufferIso);

    const title = `[CHAMADO REMOTO] ${ticket.empresa} - ${ticket.nomeCliente}`;
    const details = [
      `📌 SOLICITAÇÃO DE SUPORTE REMOTO (${ticket.id})`,
      `🏢 Empresa: ${ticket.empresa}`,
      `👤 Funcionário/Cliente: ${ticket.nomeCliente}`,
      `📱 WhatsApp: ${ticket.whatsapp}`,
      `💻 Acesso Remoto: ${ticket.ferramentaRemota || 'AnyDesk'} ${ticket.idRemoto ? '(' + ticket.idRemoto + ')' : ''}`,
      `⏱️ Atendimento: ${win.horaInicio} às ${win.horaFimServico} (+15 min de reserva até ${win.horaFimComReserva})`,
      `📅 2ª Sugestão Alternativa: ${ticket.sugestao2Formatada || 'Não informada'}`,
      ``,
      `${ticket.descricao}`,
      ``,
      `⚖️ Nota: As licenças originais dos softwares são de propriedade e responsabilidade da empresa contratante.`
    ].join('\n');

    const paramsObj = {
      action: 'TEMPLATE',
      text: title,
      dates: `${startUTC}/${endUTC}`,
      details: details,
      location: `Atendimento 100% Remoto (${ticket.ferramentaRemota || 'AnyDesk'})`,
      trp: 'true'
    };
    if (ownerEmail) paramsObj.add = ownerEmail;

    const params = new URLSearchParams(paramsObj);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /**
   * Gera e baixa um arquivo de Convite de Reunião (.ics) compatível com Android/iOS/Google Agenda
   * com Alarme de Celular configurado (15 min antes)
   */
  function downloadIcsCalendarInvite(ticket) {
    const cfg = SecurityManager.loadCloudConfig();
    const ownerEmail = cfg.ownerEmail || 'suporte@diacov.local';
    const win = SchedulerManager.calculateWindowWithBuffer(ticket.sugestao1ISO, ticket.duracaoMinutos);

    const startUTC = toGoogleCalendarUTCString(win.startIso);
    const endUTC = toGoogleCalendarUTCString(win.endWithBufferIso);
    const nowUTC = toGoogleCalendarUTCString(new Date().toISOString());

    const cleanDesc = String(ticket.descricao || '')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,');

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sistema de Chamados Diacov//Google Calendar Integration//PT-BR',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${ticket.id}-${Date.now()}@diacov.chamados`,
      `DTSTAMP:${nowUTC}`,
      `DTSTART:${startUTC}`,
      `DTEND:${endUTC}`,
      `SUMMARY:[CHAMADO REMOTO] ${ticket.empresa} - ${ticket.nomeCliente}`,
      `DESCRIPTION:WhatsApp: ${ticket.whatsapp}\\nAcesso: ${ticket.ferramentaRemota} ${ticket.idRemoto}\\nJanela com 15m reserva: ${win.horaInicio} as ${win.horaFimComReserva}\\n\\n${cleanDesc}`,
      `LOCATION:Atendimento Remoto (${ticket.ferramentaRemota || 'AnyDesk'})`,
      `ORGANIZER;CN="Suporte Diacov":mailto:${ownerEmail}`,
      'STATUS:TENTATIVE',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Lembrete de Chamado Remoto em 15 minutos',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Convite_${ticket.id}_${ticket.empresa.replace(/\s+/g, '_')}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Comunicação com o Backend Privado no Google Apps Script (Drive + Calendar + Planilha 12 Abas)
   */
  async function callGoogleBackend(payload) {
    const cfg = SecurityManager.loadCloudConfig();
    if (!cfg.gasWebAppUrl || !cfg.gasWebAppUrl.startsWith('https://script.google.com/')) {
      return {
        ok: false,
        offlineMode: true,
        message: 'URL do Google Apps Script ainda não vinculada no Painel Admin (operando em modo local seguro).'
      };
    }

    try {
      const response = await fetch(cfg.gasWebAppUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (err) {
      return {
        ok: false,
        error: err.message
      };
    }
  }

  async function syncPublicCatalogFromDrive() {
    const res = await callGoogleBackend({ action: 'getPublicCatalog' });
    if (res && res.ok) {
      if (res.empresasCsv) CatalogManager.setCompaniesCsvRaw(res.empresasCsv);
      if (res.acessosSegurancaCsv) SecurityManager.setSecurityCsvRaw(res.acessosSegurancaCsv);
      if (Array.isArray(res.ticketsList) && res.ticketsList.length > 0) {
        SchedulerManager.saveAllTickets(res.ticketsList);
      }
      return { ok: true, source: 'google_drive', data: res };
    }
    return { ok: false, source: 'local_cache' };
  }

  async function saveSecurityCsvToGoogleDrive(securityCsv) {
    const adminHash = SecurityManager.getBackendCompatibleAdminHash();
    return await callGoogleBackend({
      action: 'saveSecurityCsv',
      adminHash,
      csvContent: securityCsv
    });
  }

  async function saveCsvsToGoogleDrive(companiesCsv, servicesCsv) {
    const adminHash = SecurityManager.getBackendCompatibleAdminHash();
    const r1 = await callGoogleBackend({
      action: 'saveCompaniesCsv',
      adminHash,
      csvContent: companiesCsv
    });
    const r2 = await callGoogleBackend({
      action: 'saveServicesCsv',
      adminHash,
      csvContent: servicesCsv
    });
    return { ok: Boolean(r1.ok && r2.ok), r1, r2 };
  }

  async function syncMonthToGoogleDriveSpreadsheet(year, monthZeroBased, ticketsList) {
    const adminHash = SecurityManager.getBackendCompatibleAdminHash();
    return await callGoogleBackend({
      action: 'syncCalendarAndSheet',
      adminHash,
      year,
      month: monthZeroBased,
      tickets: ticketsList
    });
  }

  async function saveBillingHtmlToGoogleDrive(fileName, htmlContent) {
    const adminHash = SecurityManager.getBackendCompatibleAdminHash();
    return await callGoogleBackend({
      action: 'saveBillingReportHtml',
      adminHash,
      fileName,
      htmlContent
    });
  }

  return {
    generateGoogleCalendarInviteUrl,
    downloadIcsCalendarInvite,
    callGoogleBackend,
    syncPublicCatalogFromDrive,
    saveSecurityCsvToGoogleDrive,
    saveCsvsToGoogleDrive,
    syncMonthToGoogleDriveSpreadsheet,
    saveBillingHtmlToGoogleDrive
  };
})();
