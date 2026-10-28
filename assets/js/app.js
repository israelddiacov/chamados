/**
 * ============================================================================
 * CONTROLADOR PRINCIPAL DA APLICAÇÃO
 * - Calendário do Cliente com exibição de horários ocupados
 * - Modal Wizard em 3 Etapas (Página 1: Horário -> Página 2: Serviços -> Página 3: Identificação)
 * - Confirmação final ("Tem certeza?") + Envio direto para WhatsApp e Google Apps Script em 2º plano
 * ============================================================================
 */

const AppController = (() => {
  let activeTopSection = 'cliente'; // 'cliente' | 'admin'
  let activeAdminTab = 'calendario'; // 'calendario' | 'cobranca' | 'catalogo' | 'seguranca'
  let selectedServiceCodes = [];
  let clientCalendarDate = new Date();
  let calendarViewDate = new Date();
  let selectedCalendarDayIso = null;
  let currentWizardStep = 1; // 1 | 2 | 3 | 4 (4 = tela final somente com mensagem de sucesso)

  function init() {
    setupDefaultBillingFilters();
    bindGlobalEvents();
    renderAuthAndViews();

    // Sincroniza catálogo público e hashes embaralhados de acessos_seguranca.csv do Google Drive
    GoogleIntegration.syncPublicCatalogFromDrive().then(res => {
      if (res && res.ok) {
        populateClientDropdowns();
      }
    });
  }

  function setupDefaultBillingFilters() {
    const now = new Date();
    const billingYear = document.getElementById('billingYear');
    const billingMonth = document.getElementById('billingMonth');
    if (billingYear) billingYear.value = String(now.getFullYear());
    if (billingMonth) billingMonth.value = String(now.getMonth());
  }

  function bindGlobalEvents() {
    document.getElementById('navBtnCliente')?.addEventListener('click', () => {
      activeTopSection = 'cliente';
      renderAuthAndViews();
    });

    document.getElementById('navBtnAdmin')?.addEventListener('click', () => {
      activeTopSection = 'admin';
      renderAuthAndViews();
    });

    // Login do Cliente
    document.getElementById('formClientLogin')?.addEventListener('submit', e => {
      e.preventDefault();
      const passInput = document.getElementById('clientPasswordInput');
      const res = SecurityManager.validateClientPassword(passInput.value);
      const errEl = document.getElementById('clientLoginError');
      if (!res.ok) {
        errEl.textContent = res.error;
        errEl.classList.remove('hidden');
        return;
      }
      errEl.classList.add('hidden');
      passInput.value = '';
      renderAuthAndViews();
      showToast('Acesso liberado! Clique em um dia do calendário para agendar.', 'emerald');
    });

    // Login do Administrador
    document.getElementById('formAdminLogin')?.addEventListener('submit', e => {
      e.preventDefault();
      const passInput = document.getElementById('adminPasswordInput');
      const res = SecurityManager.validateAdminPassword(passInput.value);
      const errEl = document.getElementById('adminLoginError');
      if (!res.ok) {
        errEl.textContent = res.error;
        errEl.classList.remove('hidden');
        return;
      }
      errEl.classList.add('hidden');
      passInput.value = '';
      renderAuthAndViews();
      showToast('Painel Administrativo desbloqueado!', 'blue');
    });

    document.getElementById('btnLogoutClient')?.addEventListener('click', () => {
      SecurityManager.logoutClient();
      closeClientWizardModal();
      renderAuthAndViews();
      showToast('Sessão encerrada.', 'slate');
    });

    document.getElementById('btnLogoutAdmin')?.addEventListener('click', () => {
      SecurityManager.logoutAdmin();
      renderAuthAndViews();
      showToast('Painel Administrativo bloqueado.', 'slate');
    });

    // Navegação do Calendário da Área do Cliente
    document.getElementById('btnClientCalPrev')?.addEventListener('click', () => {
      clientCalendarDate = new Date(clientCalendarDate.getFullYear(), clientCalendarDate.getMonth() - 1, 1);
      renderClientAvailabilityCalendar();
    });

    document.getElementById('btnClientCalNext')?.addEventListener('click', () => {
      clientCalendarDate = new Date(clientCalendarDate.getFullYear(), clientCalendarDate.getMonth() + 1, 1);
      renderClientAvailabilityCalendar();
    });

    // Fechar Modal do Wizard do Cliente
    document.getElementById('btnCloseClientWizard')?.addEventListener('click', closeClientWizardModal);

    // Navegação entre as 3 páginas do Modal Wizard
    document.getElementById('btnWizardNext1')?.addEventListener('click', () => {
      const s1Val = document.getElementById('inputSugestao1')?.value;
      if (!s1Val) {
        showToast('Por favor, informe a 1ª sugestão de dia e horário antes de avançar.', 'rose');
        document.getElementById('inputSugestao1')?.focus();
        return;
      }
      setWizardStep(2);
    });

    document.getElementById('btnWizardBack2')?.addEventListener('click', () => {
      setWizardStep(1);
    });

    document.getElementById('btnWizardNext2')?.addEventListener('click', () => {
      const desc = document.getElementById('inputDescricaoChamado')?.value.trim();
      if (selectedServiceCodes.length === 0 && (!desc || desc.length < 3)) {
        showToast('Adicione pelo menos um serviço ou descreva o que precisa na caixa de texto.', 'rose');
        return;
      }
      setWizardStep(3);
    });

    document.getElementById('btnWizardBack3')?.addEventListener('click', () => {
      document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
      document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
      setWizardStep(2);
    });

    // Botão Concluir na Página 3 -> Verifica todos os campos e pergunta "Tem certeza?"
    document.getElementById('btnWizardPreConclude')?.addEventListener('click', handlePreConcludeValidation);

    // Cancelar revisão dentro da confirmação
    document.getElementById('btnCancelConfirmTicket')?.addEventListener('click', () => {
      document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
      document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
    });

    // Confirmação definitiva ("Sim, Confirmar e Enviar Agora")
    document.getElementById('btnFinalConfirmSend')?.addEventListener('click', handleFinalConfirmAndSend);

    // Previne submit acidental por Enter antes da confirmação
    document.getElementById('formCreateTicket')?.addEventListener('submit', e => {
      e.preventDefault();
    });

    // Máscara de WhatsApp
    const waInput = document.getElementById('inputWhatsapp');
    waInput?.addEventListener('input', e => {
      e.target.value = WhatsAppManager.applyPhoneMask(e.target.value);
    });

    // Adicionar serviço na Página 2 do Modal
    document.getElementById('btnAddService')?.addEventListener('click', () => {
      const sel = document.getElementById('selectServiceCatalog');
      if (!sel || !sel.value) return;
      addServiceToSelection(sel.value);
    });

    document.getElementById('inputSugestao1')?.addEventListener('change', updateWindowPreviewBanner);
    document.getElementById('inputSugestao2')?.addEventListener('change', updateWindowPreviewBanner);

    // Abas do Painel Administrativo
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeAdminTab = btn.getAttribute('data-admin-tab');
        renderAdminTabs();
      });
    });

    document.getElementById('btnCalPrev')?.addEventListener('click', () => {
      calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
      renderAdminCalendarAndList();
    });

    document.getElementById('btnCalNext')?.addEventListener('click', () => {
      calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
      renderAdminCalendarAndList();
    });

    document.getElementById('btnCalClearFilter')?.addEventListener('click', () => {
      selectedCalendarDayIso = null;
      renderAdminCalendarAndList();
    });

    ['billingCompany', 'billingMonth', 'billingYear', 'billingMode', 'billingFlatValue'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderBillingTabPreview);
      document.getElementById(id)?.addEventListener('input', renderBillingTabPreview);
    });

    document.getElementById('btnOpenPrintReport')?.addEventListener('click', handleOpenPrintableReport);
    document.getElementById('btnSyncDriveSheet')?.addEventListener('click', handleSyncGoogleDriveSpreadsheet);
    document.getElementById('btnSaveReportToDrive')?.addEventListener('click', handleSaveHtmlReportToDrive);

    document.getElementById('formAddCompany')?.addEventListener('submit', handleAddCompanySubmit);
    document.getElementById('btnSaveCsvsDrive')?.addEventListener('click', handleSyncCsvsToDrive);
    document.getElementById('btnDownloadEmpresasCsv')?.addEventListener('click', () => {
      CatalogManager.downloadCsvFile('empresas.csv', CatalogManager.getCompaniesCsvRaw());
    });
    document.getElementById('btnDownloadServicosCsv')?.addEventListener('click', () => {
      CatalogManager.downloadCsvFile('servicos_valores.csv', CatalogManager.getServicesCsvRaw());
    });
    document.getElementById('btnDownloadSecurityCsv')?.addEventListener('click', () => {
      CatalogManager.downloadCsvFile('acessos_seguranca.csv', SecurityManager.getSecurityCsvRaw());
    });

    document.getElementById('formUpdatePasswords')?.addEventListener('submit', handleUpdatePasswordsSubmit);
    document.getElementById('formSaveCloudConfig')?.addEventListener('submit', handleSaveCloudConfigSubmit);
  }

  function renderAuthAndViews() {
    const btnCli = document.getElementById('navBtnCliente');
    const btnAdm = document.getElementById('navBtnAdmin');

    const secClienteWrap = document.getElementById('sectionClienteWrapper');
    const secAdminWrap = document.getElementById('sectionAdminWrapper');

    if (activeTopSection === 'cliente') {
      secClienteWrap?.classList.remove('hidden');
      secAdminWrap?.classList.add('hidden');
      btnCli?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnCli?.classList.remove('text-slate-700');
      btnAdm?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnAdm?.classList.add('text-slate-700');

      const clientLock = document.getElementById('clientLockScreen');
      const clientApp = document.getElementById('clientUnlockedContent');
      if (SecurityManager.isClientAuthenticated()) {
        clientLock?.classList.add('hidden');
        clientApp?.classList.remove('hidden');
        populateClientDropdowns();
        renderClientAvailabilityCalendar();
      } else {
        clientLock?.classList.remove('hidden');
        clientApp?.classList.add('hidden');
      }
    } else {
      secClienteWrap?.classList.add('hidden');
      secAdminWrap?.classList.remove('hidden');
      btnAdm?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btnAdm?.classList.remove('text-slate-700');
      btnCli?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btnCli?.classList.add('text-slate-700');

      const adminLock = document.getElementById('adminLockScreen');
      const adminApp = document.getElementById('adminUnlockedContent');
      if (SecurityManager.isAdminAuthenticated()) {
        adminLock?.classList.add('hidden');
        adminApp?.classList.remove('hidden');
        renderAdminTabs();
      } else {
        adminLock?.classList.remove('hidden');
        adminApp?.classList.add('hidden');
      }
    }
  }

  /**
   * Renderiza o Calendário Mensal na Tela do Cliente mostrando os horários ocupados
   * e abrindo o Modal Wizard ao clicar em qualquer dia
   */
  function renderClientAvailabilityCalendar() {
    const allTickets = SchedulerManager.getAllTickets();
    const year = clientCalendarDate.getFullYear();
    const month = clientCalendarDate.getMonth();

    setText('clientCalendarMonthTitle', `${BillingManager.MESES[month]} de ${year}`);

    const firstDayWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('clientCalendarGridCells');
    if (!grid) return;

    const monthTickets = allTickets.filter(t => {
      if (t.status === 'cancelado') return false;
      const dt = new Date(t.sugestao1ISO);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });

    let cellsHtml = '';
    for (let i = 0; i < firstDayWeek; i++) {
      cellsHtml += `<div class="min-h-[110px] rounded-xl bg-slate-50 border border-slate-100"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayIsoPrefix = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayTickets = monthTickets
        .filter(t => new Date(t.sugestao1ISO).getDate() === d)
        .sort((a, b) => new Date(a.sugestao1ISO) - new Date(b.sugestao1ISO));

      const busyBadgesHtml =
        dayTickets.length === 0
          ? `<div class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 mt-1">
               🟢 Horários livres
             </div>`
          : dayTickets
              .map(
                t => `<div class="text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 truncate" title="Horário já reservado das ${t.horaInicio} às ${t.horaFimComReserva}">
                        🔴 Ocupado: ${t.horaInicio} - ${t.horaFimComReserva}
                      </div>`
              )
              .join('');

      cellsHtml += `
        <div data-client-cal-day="${dayIsoPrefix}"
          class="min-h-[110px] p-3 rounded-xl border bg-white border-slate-200 hover:border-blue-600 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group">
          <div class="flex items-center justify-between">
            <span class="text-base font-extrabold text-slate-900 group-hover:text-blue-600">${String(d).padStart(
              2,
              '0'
            )}</span>
            <span class="text-xs font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition">
              Agendar +
            </span>
          </div>
          <div class="space-y-1.5 mt-2">
            ${busyBadgesHtml}
          </div>
        </div>`;
    }

    grid.innerHTML = cellsHtml;
    grid.querySelectorAll('[data-client-cal-day]').forEach(cell => {
      cell.addEventListener('click', () => {
        const clickedDateIso = cell.getAttribute('data-client-cal-day');
        openClientWizardForDate(clickedDateIso);
      });
    });
  }

  /**
   * Abre o Modal Wizard na Página 1 preenchendo a data clicada e listando os horários ocupados do dia
   */
  function openClientWizardForDate(dateIsoYYYYMMDD) {
    const [yy, mm, dd] = dateIsoYYYYMMDD.split('-').map(Number);
    const formattedDateBR = `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${yy}`;

    setText('wizardSelectedDateLabel', formattedDateBR);

    // Busca horários ocupados neste dia
    const allTickets = SchedulerManager.getAllTickets();
    const dayBusy = allTickets
      .filter(t => {
        if (t.status === 'cancelado') return false;
        const dt = new Date(t.sugestao1ISO);
        return dt.getFullYear() === yy && dt.getMonth() + 1 === mm && dt.getDate() === dd;
      })
      .sort((a, b) => new Date(a.sugestao1ISO) - new Date(b.sugestao1ISO));

    const busyContainer = document.getElementById('wizardDayBusySlotsList');
    if (busyContainer) {
      if (dayBusy.length === 0) {
        busyContainer.innerHTML = `<span class="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-sm font-bold">🟢 Todos os horários estão livres neste dia!</span>`;
      } else {
        busyContainer.innerHTML = dayBusy
          .map(
            t =>
              `<span class="px-3 py-1.5 rounded-lg bg-rose-100 border border-rose-200 text-rose-800 text-sm font-bold">
                🔴 Ocupado: ${t.horaInicio} às ${t.horaFimComReserva}
              </span>`
          )
          .join('');
      }
    }

    // Define horário inicial sugerido (ex: 09:00 e 14:30 no dia clicado)
    const s1Input = document.getElementById('inputSugestao1');
    const s2Input = document.getElementById('inputSugestao2');
    if (s1Input) s1Input.value = `${dateIsoYYYYMMDD}T09:00`;
    if (s2Input) s2Input.value = `${dateIsoYYYYMMDD}T14:30`;

    // Reseta o estado do modal para a Página 1
    document.getElementById('wizardConfirmPromptBox')?.classList.add('hidden');
    document.getElementById('wizardStep3FooterBtns')?.classList.remove('hidden');
    populateClientDropdowns();
    renderSelectedServicesChips();
    updateWindowPreviewBanner();
    setWizardStep(1);

    document.getElementById('modalClientWizard')?.classList.remove('hidden');
  }

  function closeClientWizardModal() {
    document.getElementById('modalClientWizard')?.classList.add('hidden');
  }

  /**
   * Alterna entre as Páginas 1, 2, 3 e a Tela Final de Sucesso (4) dentro do Modal
   */
  function setWizardStep(stepNumber) {
    currentWizardStep = stepNumber;

    const p1 = document.getElementById('wizardPage1');
    const p2 = document.getElementById('wizardPage2');
    const p3 = document.getElementById('wizardPage3');
    const pFinal = document.getElementById('wizardPageSuccessFinal');
    const headerBar = document.getElementById('wizardHeaderBar');

    p1?.classList.toggle('hidden', stepNumber !== 1);
    p2?.classList.toggle('hidden', stepNumber !== 2);
    p3?.classList.toggle('hidden', stepNumber !== 3);
    pFinal?.classList.toggle('hidden', stepNumber !== 4);

    if (stepNumber === 4) {
      headerBar?.classList.add('hidden');
      return;
    }

    headerBar?.classList.remove('hidden');

    const titles = {
      1: { badge: 'Página 1 de 3', title: '1. Sugestão de Dia e Horário' },
      2: { badge: 'Página 2 de 3', title: '2. Serviços Solicitados & Observações' },
      3: { badge: 'Página 3 de 3', title: '3. Identificação & Contato WhatsApp' }
    };

    const info = titles[stepNumber] || titles[1];
    setText('wizardStepBadge', info.badge);
    setText('wizardStepTitle', info.title);

    const prog1 = document.getElementById('wizProg1');
    const prog2 = document.getElementById('wizProg2');
    const prog3 = document.getElementById('wizProg3');

    if (prog1) prog1.className = `h-2 rounded-full transition-all ${stepNumber >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`;
    if (prog2) prog2.className = `h-2 rounded-full transition-all ${stepNumber >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`;
    if (prog3) prog3.className = `h-2 rounded-full transition-all ${stepNumber >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`;
  }

  /**
   * Ao clicar em "Concluir Agendamento" na Página 3:
   * Verifica todos os campos e exibe a pergunta de confirmação "Tem certeza?"
   */
  function handlePreConcludeValidation() {
    const s1Val = document.getElementById('inputSugestao1')?.value;
    const descVal = document.getElementById('inputDescricaoChamado')?.value.trim();
    const empresa = document.getElementById('selectEmpresaCliente')?.value;
    const nomeCliente = document.getElementById('inputNomeCliente')?.value.trim();
    const whatsapp = document.getElementById('inputWhatsapp')?.value.trim();

    if (!s1Val) {
      setWizardStep(1);
      showToast('Preencha a 1ª sugestão de dia e horário.', 'rose');
      return;
    }

    if (selectedServiceCodes.length === 0 && (!descVal || descVal.length < 3)) {
      setWizardStep(2);
      showToast('Selecione pelo menos um serviço ou preencha a descrição.', 'rose');
      return;
    }

    if (!empresa) {
      showToast('Selecione sua empresa.', 'rose');
      return;
    }

    const digitsPhone = String(whatsapp || '').replace(/\D/g, '');
    if (digitsPhone.length < 10) {
      showToast('Informe um número de WhatsApp válido com DDD.', 'rose');
      document.getElementById('inputWhatsapp')?.focus();
      return;
    }

    if (!nomeCliente) {
      showToast('Informe seu nome e setor.', 'rose');
      document.getElementById('inputNomeCliente')?.focus();
      return;
    }

    const formattedS1 = SchedulerManager.formatDateTimeBR(new Date(s1Val).toISOString());
    const confirmText = `Empresa: ${empresa} | Solicitante: ${nomeCliente} (${whatsapp}) | Horário sugerido: ${formattedS1}.`;
    setText('wizardConfirmSummaryText', confirmText);

    document.getElementById('wizardStep3FooterBtns')?.classList.add('hidden');
    document.getElementById('wizardConfirmPromptBox')?.classList.remove('hidden');
  }

  /**
   * Após o cliente confirmar "Sim, Confirmar e Enviar Agora":
   * 1. Registra o chamado
   * 2. Envia automaticamente em 2º plano via Google Apps Script para a Google Agenda
   * 3. Envia direto para o seu WhatsApp
   * 4. Mostra SOMENTE a mensagem final confirmando o envio (sem mais botões ou opções)
   */
  async function handleFinalConfirmAndSend() {
    const empresa = document.getElementById('selectEmpresaCliente')?.value || 'RFranco Engenharia';
    const nomeCliente = document.getElementById('inputNomeCliente')?.value.trim();
    const whatsapp = document.getElementById('inputWhatsapp')?.value.trim();
    const ferramentaRemota = document.getElementById('selectFerramentaRemota')?.value || 'AnyDesk';
    const idRemoto = document.getElementById('inputIdRemoto')?.value.trim() || '';
    const s1Val = document.getElementById('inputSugestao1')?.value;
    const s2Val = document.getElementById('inputSugestao2')?.value;
    const descricao = document.getElementById('inputDescricaoChamado')?.value.trim();

    const summary = CatalogManager.calculateServicesSummary(selectedServiceCodes);
    const finalDescription =
      descricao ||
      CatalogManager.buildTicketDescriptionWithServices(selectedServiceCodes, 'Solicitação de suporte técnico remoto.');

    const createdTicket = SchedulerManager.addTicket({
      empresa,
      nomeCliente,
      whatsapp,
      ferramentaRemota,
      idRemoto,
      servicosCodigos: summary.codigos,
      servicosNomes: summary.nomes,
      descricao: finalDescription,
      sugestao1ISO: new Date(s1Val).toISOString(),
      sugestao2ISO: s2Val ? new Date(s2Val).toISOString() : '',
      duracaoMinutos: summary.duracaoMinutos,
      valorCalculado: summary.valorTotal
    });

    // 1. Grava automaticamente em Segundo Plano na Google Agenda via Google Apps Script
    GoogleIntegration.callGoogleBackend({
      action: 'createTicketInvite',
      authHash: SecurityManager.getExpectedClientHash(),
      ticket: createdTicket
    });

    // 2. Dispara direto para o WhatsApp do Administrador (CallMeBot em 2º plano + abertura direta wa.me)
    const gcalUrl = GoogleIntegration.generateGoogleCalendarInviteUrl(createdTicket, false);
    const waResult = await WhatsAppManager.notifyOwnerOnWhatsApp(createdTicket, gcalUrl);

    if (waResult && waResult.waMeUrl) {
      window.open(waResult.waMeUrl, '_blank', 'noopener,noreferrer');
    }

    // 3. Atualiza o calendário ao fundo e mostra SOMENTE a mensagem confirmando o envio
    renderClientAvailabilityCalendar();
    setText(
      'finalSentMessageText',
      `O chamado ${createdTicket.id} (${createdTicket.empresa} — ${createdTicket.nomeCliente}) para ${createdTicket.sugestao1Formatada} foi registrado e enviado com sucesso!`
    );
    setWizardStep(4);
  }

  function populateClientDropdowns() {
    const companies = CatalogManager.parseCompaniesCsv().filter(c => c.ativo);
    const selectCompany = document.getElementById('selectEmpresaCliente');
    if (selectCompany) {
      const currentVal = selectCompany.value;
      selectCompany.innerHTML = companies
        .map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`)
        .join('');
      if (currentVal && companies.some(c => c.nome === currentVal)) {
        selectCompany.value = currentVal;
      }
    }

    const services = CatalogManager.parseServicesCsv();
    const selectService = document.getElementById('selectServiceCatalog');
    if (selectService) {
      selectService.innerHTML = services
        .map(s => {
          const conciseName = s.nome.split('(')[0].trim();
          return `<option value="${escapeHtml(s.codigo)}">${escapeHtml(conciseName)}</option>`;
        })
        .join('');
    }

    const quickBar = document.getElementById('quickServicesContainer');
    if (quickBar) {
      quickBar.innerHTML = services
        .map(s => {
          const isSelected = selectedServiceCodes.includes(s.codigo);
          const shortLabel = s.nome.split('(')[0].trim();
          return `<button type="button" data-quick-srv="${escapeHtml(s.codigo)}"
            class="text-sm px-3.5 py-2 rounded-xl border transition-all ${
              isSelected
                ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-sm'
                : 'bg-white border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-700 font-medium'
            }">
            ${isSelected ? '✓ ' : '+ '}${escapeHtml(shortLabel)}
          </button>`;
        })
        .join('');

      quickBar.querySelectorAll('[data-quick-srv]').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-quick-srv');
          if (selectedServiceCodes.includes(code)) {
            removeServiceFromSelection(code);
          } else {
            addServiceToSelection(code);
          }
        });
      });
    }
  }

  function addServiceToSelection(serviceCode) {
    if (!selectedServiceCodes.includes(serviceCode)) {
      selectedServiceCodes.push(serviceCode);
    }
    syncTextareaWithSelectedServices();
    populateClientDropdowns();
    renderSelectedServicesChips();
    updateWindowPreviewBanner();
  }

  function removeServiceFromSelection(serviceCode) {
    selectedServiceCodes = selectedServiceCodes.filter(c => c !== serviceCode);
    syncTextareaWithSelectedServices();
    populateClientDropdowns();
    renderSelectedServicesChips();
    updateWindowPreviewBanner();
  }

  function syncTextareaWithSelectedServices() {
    const textarea = document.getElementById('inputDescricaoChamado');
    if (!textarea) return;
    textarea.value = CatalogManager.buildTicketDescriptionWithServices(
      selectedServiceCodes,
      textarea.value
    );
  }

  function renderSelectedServicesChips() {
    const container = document.getElementById('selectedServicesChips');
    if (!container) return;

    const allServices = CatalogManager.parseServicesCsv();
    if (selectedServiceCodes.length === 0) {
      container.innerHTML = `<span class="text-sm text-slate-500">Nenhum serviço selecionado ainda. Escolha na lista acima ou clique nos botões para montar a descrição.</span>`;
      return;
    }

    container.innerHTML = selectedServiceCodes
      .map(code => {
        const srv = allServices.find(s => s.codigo === code);
        if (!srv) return '';
        return `<span class="animate-chip inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-sm font-bold">
          <span>🛠️ ${escapeHtml(srv.nome.split('(')[0].trim())}</span>
          <button type="button" data-remove-srv="${escapeHtml(srv.codigo)}" class="text-blue-600 hover:text-rose-600 font-extrabold ml-1" title="Remover serviço">✕</button>
        </span>`;
      })
      .join('');

    container.querySelectorAll('[data-remove-srv]').forEach(btn => {
      btn.addEventListener('click', () => {
        removeServiceFromSelection(btn.getAttribute('data-remove-srv'));
      });
    });
  }

  function updateWindowPreviewBanner() {
    const s1Input = document.getElementById('inputSugestao1');
    const previewEl = document.getElementById('windowReservePreview');
    const conflictEl = document.getElementById('scheduleConflictWarning');
    if (!s1Input || !previewEl) return;

    const summary = CatalogManager.calculateServicesSummary(selectedServiceCodes);
    if (!s1Input.value) {
      previewEl.textContent = `Duração estimada para o atendimento: aproximadamente ${summary.duracaoMinutos} minutos.`;
      return;
    }

    const win = SchedulerManager.calculateWindowWithBuffer(
      new Date(s1Input.value).toISOString(),
      summary.duracaoMinutos
    );

    previewEl.innerHTML = `📅 Horário sugerido: <strong>${win.dataBR} das ${win.horaInicio} às ${win.horaFimServico}</strong> (duração média de ${win.duracaoMinutos} minutos).`;

    const conflict = SchedulerManager.checkScheduleConflict(
      new Date(s1Input.value).toISOString(),
      summary.duracaoMinutos
    );

    if (conflictEl) {
      if (conflict.hasConflict) {
        conflictEl.textContent = `⚠️ Este horário coincide com um período já ocupado neste dia. Por favor, ajuste o horário ou informe uma 2ª opção.`;
        conflictEl.classList.remove('hidden');
      } else {
        conflictEl.classList.add('hidden');
      }
    }
  }

  function renderAdminTabs() {
    document.querySelectorAll('[data-admin-tab]').forEach(btn => {
      const tab = btn.getAttribute('data-admin-tab');
      if (tab === activeAdminTab) {
        btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.remove('bg-slate-100', 'text-slate-700');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('bg-slate-100', 'text-slate-700');
      }
    });

    ['calendario', 'cobranca', 'catalogo', 'seguranca'].forEach(tabId => {
      const panel = document.getElementById(`adminTab_${tabId}`);
      if (panel) {
        panel.classList.toggle('hidden', tabId !== activeAdminTab);
      }
    });

    if (activeAdminTab === 'calendario') {
      renderAdminCalendarAndList();
    } else if (activeAdminTab === 'cobranca') {
      populateBillingCompanyFilter();
      renderBillingTabPreview();
    } else if (activeAdminTab === 'catalogo') {
      renderAdminCatalogTab();
    } else if (activeAdminTab === 'seguranca') {
      renderAdminSecurityTab();
    }
  }

  function renderAdminCalendarAndList() {
    const allTickets = SchedulerManager.getAllTickets();
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    const monthTickets = allTickets.filter(t => {
      const dt = new Date(t.sugestao1ISO);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
    const pendingCount = allTickets.filter(t => t.status === 'pendente').length;
    const confirmedMonth = monthTickets.filter(t => t.status === 'confirmado' || t.status === 'concluido');
    const revenueMonth = confirmedMonth.reduce((acc, t) => acc + (Number(t.valorCalculado) || 0), 0);

    setText('statPendingCount', String(pendingCount));
    setText('statConfirmedCount', String(confirmedMonth.length));
    setText('statRevenueMonth', BillingManager.formatCurrencyBR(revenueMonth));

    setText('calendarMonthTitle', `${BillingManager.MESES[month]} de ${year}`);

    const firstDayWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('calendarGridCells');

    if (grid) {
      let cellsHtml = '';
      for (let i = 0; i < firstDayWeek; i++) {
        cellsHtml += `<div class="min-h-[92px] rounded-xl bg-slate-50 border border-slate-100"></div>`;
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const dayIsoPrefix = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTickets = monthTickets.filter(t => {
          const dt = new Date(t.sugestao1ISO);
          return dt.getDate() === d && t.status !== 'cancelado';
        });

        const isSelected = selectedCalendarDayIso === dayIsoPrefix;
        const badgeList = dayTickets
          .slice(0, 3)
          .map(t => {
            const colorClass =
              t.status === 'pendente'
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-emerald-100 text-emerald-900 border-emerald-300';
            return `<div class="text-xs font-medium truncate px-1.5 py-0.5 rounded border ${colorClass}" title="${escapeHtml(
              `${t.horaInicio}-${t.horaFimComReserva} (+15m) | ${t.empresa}: ${t.nomeCliente}`
            )}">
              ${t.horaInicio} ${escapeHtml(t.empresa.split(' ')[0])}
            </div>`;
          })
          .join('');

        cellsHtml += `
          <div data-cal-day="${dayIsoPrefix}"
            class="min-h-[92px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
              isSelected
                ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-600/20'
                : dayTickets.length > 0
                ? 'bg-white border-slate-300 hover:border-blue-500'
                : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
            }">
            <div class="flex items-center justify-between">
              <span class="text-sm font-bold ${
                dayTickets.length > 0 ? 'text-slate-900' : 'text-slate-500'
              }">${String(d).padStart(2, '0')}</span>
              ${
                dayTickets.length > 0
                  ? `<span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold">${dayTickets.length}</span>`
                  : ''
              }
            </div>
            <div class="space-y-1 mt-1">${badgeList}</div>
          </div>`;
      }

      grid.innerHTML = cellsHtml;
      grid.querySelectorAll('[data-cal-day]').forEach(cell => {
        cell.addEventListener('click', () => {
          const clickedDay = cell.getAttribute('data-cal-day');
          selectedCalendarDayIso = selectedCalendarDayIso === clickedDay ? null : clickedDay;
          renderAdminCalendarAndList();
        });
      });
    }

    const filterNotice = document.getElementById('calendarFilterNotice');
    const clearBtn = document.getElementById('btnCalClearFilter');
    let ticketsToShow = allTickets;

    if (selectedCalendarDayIso) {
      ticketsToShow = allTickets.filter(t => {
        const dt = new Date(t.sugestao1ISO);
        const isoDay = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
          dt.getDate()
        ).padStart(2, '0')}`;
        return isoDay === selectedCalendarDayIso;
      });
      if (filterNotice) {
        const [yy, mm, dd] = selectedCalendarDayIso.split('-');
        filterNotice.textContent = `Exibindo dia ${dd}/${mm}/${yy}`;
      }
      clearBtn?.classList.remove('hidden');
    } else {
      if (filterNotice) filterNotice.textContent = 'Exibindo todos os chamados recentes';
      clearBtn?.classList.add('hidden');
    }

    renderTicketsListCards(ticketsToShow);
  }

  function renderTicketsListCards(tickets) {
    const container = document.getElementById('adminTicketsListContainer');
    if (!container) return;

    if (tickets.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-slate-500 corp-card text-base">Nenhum chamado encontrado para este filtro.</div>`;
      return;
    }

    container.innerHTML = tickets
      .map(t => {
        const statusBadge =
          t.status === 'pendente'
            ? `<span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">⏳ Pendente</span>`
            : t.status === 'confirmado'
            ? `<span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">✅ Aceito</span>`
            : `<span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">🏁 Concluído</span>`;

        const gcalUrl1 = GoogleIntegration.generateGoogleCalendarInviteUrl(t, false);

        return `
        <div class="corp-card p-5 space-y-3.5">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-mono text-blue-600 font-bold">${escapeHtml(t.id)}</span>
                <span class="text-sm font-bold text-slate-900 px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200">${escapeHtml(
                  t.empresa
                )}</span>
                ${statusBadge}
              </div>
              <h4 class="text-base font-bold text-slate-900 mt-1.5">👤 ${escapeHtml(
                t.nomeCliente
              )} — <span class="text-emerald-700 font-semibold">📱 ${escapeHtml(t.whatsapp)}</span></h4>
            </div>
            <div class="text-right">
              <span class="text-xs text-slate-500 font-semibold block">Valor Mão de Obra</span>
              <div class="flex items-center gap-1 mt-1">
                <span class="text-sm font-bold text-slate-600">R$</span>
                <input type="number" step="5" value="${Number(t.valorCalculado || 0).toFixed(2)}"
                  data-price-ticket="${escapeHtml(t.id)}"
                  class="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-right text-sm font-bold text-slate-900 focus:border-blue-600 focus:outline-none" />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <span class="text-slate-500 block">1ª Sugestão:</span>
              <strong class="text-slate-900">${escapeHtml(t.sugestao1Formatada)}</strong>
              <span class="block text-blue-700 font-semibold mt-0.5">⏱️ ${t.horaInicio} às ${
          t.horaFimServico
        } (+15m reserva até ${t.horaFimComReserva})</span>
            </div>
            <div>
              <span class="text-slate-500 block">2ª Sugestão:</span>
              <strong class="text-slate-800">${escapeHtml(t.sugestao2Formatada)}</strong>
              <span class="block text-slate-600 mt-0.5">💻 ${escapeHtml(
                t.ferramentaRemota
              )} ${t.idRemoto ? '— ID: ' + escapeHtml(t.idRemoto) : ''}</span>
            </div>
          </div>

          <pre class="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 p-3.5 rounded-xl border border-slate-200 font-sans leading-relaxed">${escapeHtml(
            t.descricao
          )}</pre>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" data-action="accept1" data-id="${escapeHtml(t.id)}"
              class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition">
              ✓ Aceitar 1ª Opção
            </button>
            ${
              t.sugestao2ISO
                ? `<button type="button" data-action="accept2" data-id="${escapeHtml(t.id)}"
                    class="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition">
                    ✓ Aceitar 2ª Opção
                  </button>`
                : ''
            }
            <a href="${gcalUrl1}" target="_blank" rel="noopener noreferrer"
              class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition">
              📅 Google Agenda
            </a>
            <button type="button" data-action="waConfirm" data-id="${escapeHtml(t.id)}"
              class="px-3.5 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition">
              💬 Confirmar no WhatsApp
            </button>
            <button type="button" data-action="done" data-id="${escapeHtml(t.id)}"
              class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition">
              🏁 Concluir
            </button>
            <button type="button" data-action="delete" data-id="${escapeHtml(t.id)}"
              class="ml-auto px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition">
              🗑️ Excluir
            </button>
          </div>
        </div>`;
      })
      .join('');

    container.querySelectorAll('[data-price-ticket]').forEach(inp => {
      inp.addEventListener('change', e => {
        const id = inp.getAttribute('data-price-ticket');
        SchedulerManager.updateTicketPrice(id, e.target.value);
        renderAdminCalendarAndList();
        showToast(`Valor do chamado ${id} atualizado!`, 'emerald');
      });
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const all = SchedulerManager.getAllTickets();
        const found = all.find(x => x.id === id);
        if (!found) return;

        if (action === 'accept1') {
          SchedulerManager.updateTicketStatus(id, 'confirmado', false);
          renderAdminCalendarAndList();
          showToast(`Chamado ${id} confirmado no 1º horário!`, 'emerald');
        } else if (action === 'accept2') {
          SchedulerManager.updateTicketStatus(id, 'confirmado', true);
          renderAdminCalendarAndList();
          showToast(`Chamado ${id} confirmado na 2ª opção!`, 'emerald');
        } else if (action === 'done') {
          SchedulerManager.updateTicketStatus(id, 'concluido', false);
          renderAdminCalendarAndList();
          showToast(`Chamado ${id} concluído!`, 'blue');
        } else if (action === 'waConfirm') {
          WhatsAppManager.openClientConfirmationWhatsApp(found);
        } else if (action === 'delete') {
          SchedulerManager.deleteTicket(id);
          renderAdminCalendarAndList();
          showToast(`Chamado ${id} removido.`, 'slate');
        }
      });
    });
  }

  function populateBillingCompanyFilter() {
    const sel = document.getElementById('billingCompany');
    if (!sel) return;
    const current = sel.value;
    const companies = CatalogManager.parseCompaniesCsv();
    sel.innerHTML =
      `<option value="RFranco Engenharia">RFranco Engenharia</option>` +
      companies
        .filter(c => c.nome !== 'RFranco Engenharia')
        .map(c => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`)
        .join('') +
      `<option value="TODAS">Todas as Empresas Consolidado</option>`;

    if (current) sel.value = current;
  }

  function getSelectedBillingOptions() {
    const companyName = document.getElementById('billingCompany')?.value || 'RFranco Engenharia';
    const monthZeroBased = Number(document.getElementById('billingMonth')?.value ?? new Date().getMonth());
    const year = Number(document.getElementById('billingYear')?.value || new Date().getFullYear());
    const pricingMode = document.getElementById('billingMode')?.value || 'dificuldade';
    const flatRateValue = Number(document.getElementById('billingFlatValue')?.value || 100);

    const flatWrap = document.getElementById('billingFlatInputWrapper');
    if (flatWrap) {
      flatWrap.classList.toggle('hidden', pricingMode !== 'fixo');
    }

    return { companyName, monthZeroBased, year, pricingMode, flatRateValue };
  }

  function renderBillingTabPreview() {
    const opts = getSelectedBillingOptions();
    const billingData = BillingManager.generateMonthlyBillingData(opts);

    setText('billStatCount', `${billingData.totalAtendimentos} atendimento(s)`);
    setText('billStatTotal', BillingManager.formatCurrencyBR(billingData.valorTotalGeral));
    setText(
      'billStatFormula',
      opts.pricingMode === 'fixo'
        ? `${billingData.totalAtendimentos} × ${BillingManager.formatCurrencyBR(opts.flatRateValue)}`
        : 'Calculado por dificuldade (servicos_valores.csv)'
    );

    const tbodyItems = document.getElementById('billingItemsPreviewBody');
    if (tbodyItems) {
      if (billingData.itens.length === 0) {
        tbodyItems.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-500 text-base">Nenhum atendimento aceito/concluído para <strong>${escapeHtml(
          opts.companyName
        )}</strong> em <strong>${billingData.mesNome}/${billingData.ano}</strong>.</td></tr>`;
      } else {
        tbodyItems.innerHTML = billingData.itens
          .map(
            it => `
          <tr class="border-b border-slate-200 hover:bg-slate-50">
            <td class="py-3 px-4 font-mono text-sm font-bold text-blue-600">${escapeHtml(it.id)}</td>
            <td class="py-3 px-4 text-sm text-slate-800">${escapeHtml(it.dataBR)} <span class="text-slate-500">(${escapeHtml(
              it.horarioJanela
            )})</span></td>
            <td class="py-3 px-4 text-sm text-slate-900 font-bold">${escapeHtml(
              it.solicitante
            )} <span class="text-slate-500 font-normal">(${escapeHtml(it.empresa)})</span></td>
            <td class="py-3 px-4 text-sm text-slate-700">${escapeHtml(it.servicosLista)}</td>
            <td class="py-3 px-4 text-sm text-right font-extrabold text-emerald-700">${BillingManager.formatCurrencyBR(
              it.valorCobrado
            )}</td>
          </tr>`
          )
          .join('');
      }
    }

    const tbodyDays = document.getElementById('billingDailySheetBody');
    if (tbodyDays) {
      tbodyDays.innerHTML = billingData.linhasDiasDoMes
        .map(
          d => `
        <tr class="border-b border-slate-200 ${
          d.qtdAtendimentos > 0 ? 'bg-blue-50/60 text-slate-900' : 'text-slate-400'
        }">
          <td class="py-2 px-4 text-sm font-semibold">Dia ${String(d.dia).padStart(2, '0')} (${
            d.dataFormatada
          })</td>
          <td class="py-2 px-4 text-sm text-center font-bold">${d.qtdAtendimentos}</td>
          <td class="py-2 px-4 text-sm">${escapeHtml(d.clientes)}</td>
          <td class="py-2 px-4 text-sm">${escapeHtml(d.servicos)}</td>
          <td class="py-2 px-4 text-sm text-right font-bold ${
            d.subtotalDia > 0 ? 'text-emerald-700' : ''
          }">${BillingManager.formatCurrencyBR(d.subtotalDia)}</td>
        </tr>`
        )
        .join('');
    }
  }

  function handleOpenPrintableReport() {
    const opts = getSelectedBillingOptions();
    const billingData = BillingManager.generateMonthlyBillingData(opts);
    const html = BillingManager.buildStandaloneReportHtml(billingData);

    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      showToast('Permita pop-ups para visualizar o relatório de impressão.', 'amber');
    }
  }

  async function handleSyncGoogleDriveSpreadsheet() {
    const opts = getSelectedBillingOptions();
    const allTickets = SchedulerManager.getAllTickets();
    showToast(`Sincronizando aba ${BillingManager.MESES[opts.monthZeroBased]} na planilha do Google Drive...`, 'blue');

    const res = await GoogleIntegration.syncMonthToGoogleDriveSpreadsheet(
      opts.year,
      opts.monthZeroBased,
      allTickets
    );

    if (res && res.ok) {
      showToast(`Planilha anual atualizada na aba ${res.sheetName} do seu Google Drive!`, 'emerald');
    } else {
      showToast(
        res.message || 'Configure a URL do seu Google Apps Script na aba Segurança para gravar direto no Google Drive.',
        'amber'
      );
    }
  }

  async function handleSaveHtmlReportToDrive() {
    const opts = getSelectedBillingOptions();
    const billingData = BillingManager.generateMonthlyBillingData(opts);
    const htmlContent = BillingManager.buildStandaloneReportHtml(billingData);
    const safeCompany = opts.companyName.replace(/\s+/g, '_');
    const fileName = `Relatorio_Cobranca_${safeCompany}_${billingData.mesNome}_${opts.year}.html`;

    const res = await GoogleIntegration.saveBillingHtmlToGoogleDrive(fileName, htmlContent);
    if (res && res.ok) {
      showToast(`Relatório salvo na pasta do seu Google Drive (${fileName})!`, 'emerald');
    } else {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Relatório HTML baixado (${fileName})!`, 'emerald');
    }
  }

  function renderAdminCatalogTab() {
    const companies = CatalogManager.parseCompaniesCsv();
    const compBody = document.getElementById('adminCompaniesTableBody');
    if (compBody) {
      compBody.innerHTML = companies
        .map(
          (c, idx) => `
        <tr class="border-b border-slate-200">
          <td class="py-2.5 px-3 text-xs font-mono font-bold text-blue-600">${escapeHtml(c.id)}</td>
          <td class="py-2.5 px-3 text-sm font-bold text-slate-900">${escapeHtml(c.nome)}</td>
          <td class="py-2.5 px-3 text-sm text-slate-600">${escapeHtml(c.responsavel)}</td>
          <td class="py-2.5 px-3 text-right">
            <button type="button" data-del-company="${idx}" class="text-xs text-rose-600 hover:text-rose-800 font-bold">Remover</button>
          </td>
        </tr>`
        )
        .join('');

      compBody.querySelectorAll('[data-del-company]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-del-company'));
          const list = CatalogManager.parseCompaniesCsv();
          list.splice(idx, 1);
          CatalogManager.setCompaniesCsvRaw(CatalogManager.serializeCompaniesToCsv(list));
          renderAdminCatalogTab();
          populateClientDropdowns();
          showToast('Empresa removida do catálogo.', 'slate');
        });
      });
    }

    const services = CatalogManager.parseServicesCsv();
    const srvBody = document.getElementById('adminServicesTableBody');
    if (srvBody) {
      srvBody.innerHTML = services
        .map(
          (s, idx) => `
        <tr class="border-b border-slate-200">
          <td class="py-2.5 px-3 text-xs font-mono font-bold text-blue-600">${escapeHtml(s.codigo)}</td>
          <td class="py-2.5 px-3 text-sm font-semibold text-slate-900">${escapeHtml(s.nome)}</td>
          <td class="py-2.5 px-3 text-sm text-amber-700 font-medium">${escapeHtml(s.dificuldade)}</td>
          <td class="py-2.5 px-3 text-sm text-center">
            <input type="number" value="${s.duracaoMinutos}" data-srv-dur="${idx}"
              class="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center text-slate-900 text-sm font-semibold" /> min
          </td>
          <td class="py-2.5 px-3 text-sm text-right">
            R$ <input type="number" step="5" value="${Number(s.valorMaoDeObra).toFixed(2)}" data-srv-price="${idx}"
              class="w-24 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-right text-emerald-700 font-bold text-sm" />
          </td>
        </tr>`
        )
        .join('');

      const saveSrvChanges = () => {
        const list = CatalogManager.parseServicesCsv();
        srvBody.querySelectorAll('[data-srv-dur]').forEach(inp => {
          const i = Number(inp.getAttribute('data-srv-dur'));
          if (list[i]) list[i].duracaoMinutos = Number(inp.value) || 30;
        });
        srvBody.querySelectorAll('[data-srv-price]').forEach(inp => {
          const i = Number(inp.getAttribute('data-srv-price'));
          if (list[i]) list[i].valorMaoDeObra = Number(inp.value) || 0;
        });
        CatalogManager.setServicesCsvRaw(CatalogManager.serializeServicesToCsv(list));
        populateClientDropdowns();
        showToast('Tabela de preços atualizada!', 'emerald');
      };

      srvBody.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', saveSrvChanges);
      });
    }
  }

  function handleAddCompanySubmit(e) {
    e.preventDefault();
    const nameInp = document.getElementById('inputNewCompanyName');
    const respInp = document.getElementById('inputNewCompanyResp');
    const nome = nameInp?.value.trim();
    if (!nome) return;

    const list = CatalogManager.parseCompaniesCsv();
    list.push({
      id: `EMP-${String(list.length + 1).padStart(2, '0')}`,
      nome,
      responsavel: respInp?.value.trim() || 'Setor Administrativo',
      ativo: true
    });

    CatalogManager.setCompaniesCsvRaw(CatalogManager.serializeCompaniesToCsv(list));
    if (nameInp) nameInp.value = '';
    if (respInp) respInp.value = '';
    renderAdminCatalogTab();
    populateClientDropdowns();
    showToast(`Empresa "${nome}" adicionada ao empresas.csv!`, 'emerald');
  }

  async function handleSyncCsvsToDrive() {
    showToast('Salvando empresas.csv e servicos_valores.csv na pasta do seu Google Drive...', 'blue');
    const res = await GoogleIntegration.saveCsvsToGoogleDrive(
      CatalogManager.getCompaniesCsvRaw(),
      CatalogManager.getServicesCsvRaw()
    );
    if (res && res.ok) {
      showToast('CSVs gravados na pasta "Sistema de Chamados - Diacov" do seu Google Drive!', 'emerald');
    } else {
      showToast(
        'Catálogo salvo localmente! Para sincronizar na nuvem, informe a URL do seu Google Apps Script na aba Segurança.',
        'amber'
      );
    }
  }

  function renderAdminSecurityTab() {
    const cfg = SecurityManager.loadCloudConfig();
    const urlInp = document.getElementById('cfgGasUrl');
    const emailInp = document.getElementById('cfgOwnerEmail');
    const waInp = document.getElementById('cfgOwnerWhatsapp');
    const cmbInp = document.getElementById('cfgCallmebotKey');
    const pixInp = document.getElementById('cfgPixKey');

    if (urlInp) urlInp.value = cfg.gasWebAppUrl || '';
    if (emailInp) emailInp.value = cfg.ownerEmail || '';
    if (waInp) waInp.value = cfg.ownerWhatsapp || '';
    if (cmbInp) cmbInp.value = cfg.callmebotApiKey || '';
    if (pixInp) pixInp.value = cfg.pixKey || '';
  }

  async function handleUpdatePasswordsSubmit(e) {
    e.preventDefault();
    const newCli = document.getElementById('inputNewClientPass')?.value;
    const newAdm = document.getElementById('inputNewAdminPass')?.value;
    const res = SecurityManager.updatePasswords(newCli, newAdm);

    if (!res.ok) {
      showToast(res.error, 'rose');
      return;
    }

    document.getElementById('inputNewClientPass').value = '';
    document.getElementById('inputNewAdminPass').value = '';

    const driveRes = await GoogleIntegration.saveSecurityCsvToGoogleDrive(res.securityCsv);
    if (driveRes && driveRes.ok) {
      showToast('Senhas embaralhadas e salvas no acessos_seguranca.csv do seu Google Drive!', 'emerald');
    } else {
      showToast('Senhas embaralhadas atualizadas! Você também pode baixar o acessos_seguranca.csv.', 'emerald');
    }
  }

  function handleSaveCloudConfigSubmit(e) {
    e.preventDefault();
    const cfg = {
      gasWebAppUrl: document.getElementById('cfgGasUrl')?.value.trim() || '',
      ownerEmail: document.getElementById('cfgOwnerEmail')?.value.trim() || '',
      ownerWhatsapp: document.getElementById('cfgOwnerWhatsapp')?.value.trim() || '',
      callmebotApiKey: document.getElementById('cfgCallmebotKey')?.value.trim() || '',
      pixKey: document.getElementById('cfgPixKey')?.value.trim() || '',
      bufferMinutes: 15
    };
    SecurityManager.saveCloudConfig(cfg);
    showToast('Configurações de conexão Google e WhatsApp salvas!', 'emerald');
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, color = 'blue') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const palette = {
      emerald: 'bg-emerald-700 border-emerald-800 text-white',
      rose: 'bg-rose-700 border-rose-800 text-white',
      amber: 'bg-amber-600 border-amber-700 text-white',
      blue: 'bg-blue-700 border-blue-800 text-white',
      slate: 'bg-slate-800 border-slate-900 text-white'
    };

    const toast = document.createElement('div');
    toast.className = `animate-spring-up px-5 py-3.5 rounded-xl border shadow-lg text-sm font-bold flex items-center gap-2.5 ${
      palette[color] || palette.blue
    }`;
    toast.innerHTML = `<span>✔️</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  return {
    init
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  AppController.init();
});
