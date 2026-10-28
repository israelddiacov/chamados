/**
 * ============================================================================
 * MÓDULO DE INTEGRAÇÃO WHATSAPP GRATUITA (CONVITES + CONFIRMAÇÃO + COBRANÇA)
 * ============================================================================
 */

const WhatsAppManager = (() => {
  function applyPhoneMask(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  function normalizePhoneToE164(phoneStr) {
    const digits = String(phoneStr || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    return `55${digits}`;
  }

  /**
   * Monta o texto de convite de chamado para o WhatsApp do Administrador
   * incluindo o link direto para aceitar no Google Agenda pelo celular
   */
  function buildOwnerInviteMessage(ticket, googleCalendarUrl) {
    return [
      `🔔 *NOVO CONVITE DE CHAMADO REMOTO (${ticket.id})*`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏢 *Empresa:* ${ticket.empresa}`,
      `👤 *Solicitante:* ${ticket.nomeCliente}`,
      `📱 *WhatsApp Cliente:* ${ticket.whatsapp}`,
      `💻 *Acesso Remoto:* ${ticket.ferramentaRemota || 'AnyDesk'} ${ticket.idRemoto ? '(' + ticket.idRemoto + ')' : ''}`,
      ``,
      `🗓️ *1ª Sugestão de Horário:* ${ticket.sugestao1Formatada}`,
      `⏳ *Janela Reservada:* ${ticket.horaInicio} às ${ticket.horaFimComReserva} _(já inclui +15 min de reserva)_`,
      `🔄 *2ª Opção Sugerida:* ${ticket.sugestao2Formatada || 'Não informada'}`,
      ``,
      `🛠️ *Descrição / Serviços:*`,
      `${ticket.descricao}`,
      ``,
      `📲 *Adicionar ao seu Google Agenda (1 toque no celular):*`,
      `${googleCalendarUrl}`
    ].join('\n');
  }

  /**
   * Dispara aviso silencioso gratuito via CallMeBot API (se configurado)
   * e retorna URL wa.me direta
   */
  async function notifyOwnerOnWhatsApp(ticket, googleCalendarUrl) {
    const cfg = SecurityManager.loadCloudConfig();
    const ownerPhone = normalizePhoneToE164(cfg.ownerWhatsapp || '5511999999999');
    const messageText = buildOwnerInviteMessage(ticket, googleCalendarUrl);

    // Se o administrador configurou a chave gratuita do CallMeBot, envia silenciosamente em segundo plano
    if (cfg.callmebotApiKey && ownerPhone) {
      try {
        const apiUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
          ownerPhone
        )}&text=${encodeURIComponent(messageText)}&apikey=${encodeURIComponent(cfg.callmebotApiKey)}`;
        fetch(apiUrl, { mode: 'no-cors' }).catch(() => {});
      } catch (e) {
        // Ignora erro de rede em background
      }
    }

    const waMeUrl = `https://wa.me/${ownerPhone}?text=${encodeURIComponent(messageText)}`;
    return {
      ok: true,
      waMeUrl,
      messageText
    };
  }

  /**
   * Gera link para o Administrador confirmar o agendamento diretamente no WhatsApp do Cliente
   */
  function openClientConfirmationWhatsApp(ticket) {
    const clientPhone = normalizePhoneToE164(ticket.whatsapp);
    const msg = [
      `Olá, *${ticket.nomeCliente}* (${ticket.empresa})! 👋`,
      ``,
      `Seu chamado de suporte remoto *${ticket.id}* foi *CONFIRMADO* na agenda! ✅`,
      ``,
      `🗓️ *Data e Horário Confirmado:* ${ticket.sugestao1Formatada}`,
      `💻 *Conexão Remota:* ${ticket.ferramentaRemota || 'AnyDesk'} ${ticket.idRemoto ? '(' + ticket.idRemoto + ')' : ''}`,
      ``,
      `Por favor, deixe o computador ligado e conectado à internet no horário agendado. Qualquer dúvida estou à disposição!`
    ].join('\n');

    const url = `https://wa.me/${clientPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return {
    applyPhoneMask,
    normalizePhoneToE164,
    buildOwnerInviteMessage,
    notifyOwnerOnWhatsApp,
    openClientConfirmationWhatsApp
  };
})();
