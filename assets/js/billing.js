/**
 * ============================================================================
 * MÓDULO DE FECHAMENTO MENSAL, PLANILHA DE 12 MESES E RELATÓRIO HTML DE COBRANÇA
 * ============================================================================
 * - Filtra agendamentos aceitos/concluídos por Empresa e Mês.
 * - Suporta cálculo automático pela Tabela de Dificuldade (servicos_valores.csv)
 *   OU valor fixo por chamado (ex: 10 atendimentos x R$ 100,00 = R$ 1.000,00).
 * - Preenche a estrutura de dias do mês (1 a 31) e gera o Relatório HTML executivo.
 */

const BillingManager = (() => {
  const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const DECLARACAO_LICENCAS =
    'DECLARAÇÃO TÉCNICA DE LICENCIAMENTO: Os valores discriminados neste demonstrativo referem-se exclusivamente à prestação de serviços técnicos de suporte remoto, diagnóstico, configuração e mão de obra de instalação de softwares. Todas as licenças originais de uso, chaves de ativação (Product Keys/Seriais) e assinaturas (Microsoft, Autodesk, Adobe, Corel, entre outros) são de propriedade, fornecimento e inteira responsabilidade da empresa contratante.';

  function formatCurrencyBR(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Calcula os dados de fechamento mensal por empresa e mês
   * @param {Object} options { year, monthZeroBased, companyName, pricingMode, flatRateValue }
   */
  function generateMonthlyBillingData(options) {
    const year = Number(options.year) || new Date().getFullYear();
    const month = Number(options.monthZeroBased ?? new Date().getMonth());
    const companyFilter = options.companyName || 'TODAS';
    const pricingMode = options.pricingMode || 'dificuldade'; // 'dificuldade' | 'fixo'
    const flatRate = Number(options.flatRateValue) || 100.0;

    const allTickets = SchedulerManager.getAllTickets();
    const acceptedTickets = allTickets
      .filter(t => {
        if (t.status !== 'confirmado' && t.status !== 'concluido') return false;
        const dt = new Date(t.sugestao1ISO);
        if (dt.getFullYear() !== year || dt.getMonth() !== month) return false;
        if (companyFilter !== 'TODAS' && t.empresa !== companyFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(a.sugestao1ISO) - new Date(b.sugestao1ISO));

    const items = acceptedTickets.map((t, index) => {
      const unitValue = pricingMode === 'fixo' ? flatRate : Number(t.valorCalculado) || 65.0;
      const dt = new Date(t.sugestao1ISO);
      return {
        ordem: index + 1,
        id: t.id,
        dia: dt.getDate(),
        dataBR: t.dataBR,
        horarioJanela: `${t.horaInicio} às ${t.horaFimComReserva}`,
        empresa: t.empresa,
        solicitante: t.nomeCliente,
        whatsapp: t.whatsapp,
        servicosLista:
          t.servicosNomes && t.servicosNomes.length > 0
            ? t.servicosNomes.join(' + ')
            : 'Suporte Técnico Remoto',
        descricaoCompleta: t.descricao,
        valorCobrado: unitValue
      };
    });

    const totalAtendimentos = items.length;
    const valorTotalGeral = items.reduce((acc, item) => acc + item.valorCobrado, 0);
    const valorMedio = totalAtendimentos > 0 ? valorTotalGeral / totalAtendimentos : 0;

    // Monta as linhas de todos os dias do mês (1 a 31) como na planilha modelo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyRows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayItems = items.filter(x => x.dia === d);
      const dayTotal = dayItems.reduce((acc, x) => acc + x.valorCobrado, 0);
      dailyRows.push({
        dia: d,
        dataFormatada: `${String(d).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
        qtdAtendimentos: dayItems.length,
        clientes: dayItems.map(x => `${x.solicitante} (${x.empresa})`).join(' | ') || '—',
        servicos: dayItems.map(x => x.servicosLista).join(' | ') || '—',
        horarios: dayItems.map(x => x.horarioJanela).join(' | ') || '—',
        subtotalDia: dayTotal
      });
    }

    return {
      ano: year,
      mesIndice: month,
      mesNome: MESES[month],
      empresaSelecionada: companyFilter,
      modoCalculo: pricingMode,
      valorFixoBase: flatRate,
      totalAtendimentos,
      valorTotalGeral,
      valorMedio,
      itens: items,
      linhasDiasDoMes: dailyRows,
      declaracaoLicencas: DECLARACAO_LICENCAS,
      geradoEm: SchedulerManager.formatDateTimeBR(new Date().toISOString())
    };
  }

  /**
   * Gera HTML completo e auto-contido do Relatório Executivo de Cobrança
   * pronto para impressão em PDF ou gravação direta no Google Drive (5TB)
   */
  function buildStandaloneReportHtml(billingData) {
    const cfg = SecurityManager.loadCloudConfig();
    const ownerEmail = cfg.ownerEmail || 'Suporte Técnico Diacov';
    const pixKey = cfg.pixKey || 'Conforme cadastro administrativo';

    const rowsChamadosHtml =
      billingData.itens.length === 0
        ? `<tr><td colspan="6" style="padding:18px;text-align:center;color:#64748b;">Nenhum atendimento confirmado/concluído para este filtro no período.</td></tr>`
        : billingData.itens
            .map(
              item => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">#${item.ordem} (${item.id})</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${item.dataBR}<br><span style="font-size:11px;color:#64748b;">${item.horarioJanela}</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;">${item.empresa}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${item.solicitante}<br><span style="font-size:11px;color:#64748b;">${item.whatsapp}</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;">${item.servicosLista}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">${formatCurrencyBR(item.valorCobrado)}</td>
        </tr>`
            )
            .join('');

    const rowsDiasMesHtml = billingData.linhasDiasDoMes
      .map(
        d => `
      <tr style="background:${d.qtdAtendimentos > 0 ? '#f8fafc' : '#ffffff'};">
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${d.qtdAtendimentos > 0 ? '#4f46e5' : '#94a3b8'};">Dia ${String(d.dia).padStart(2, '0')} (${d.dataFormatada})</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:600;">${d.qtdAtendimentos}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;">${d.clientes}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${d.servicos}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:${d.subtotalDia > 0 ? '#0f172a' : '#94a3b8'};">${formatCurrencyBR(d.subtotalDia)}</td>
      </tr>`
      )
      .join('');

    const resumoFormula =
      billingData.modoCalculo === 'fixo'
        ? `${billingData.totalAtendimentos} atendimento(s) × ${formatCurrencyBR(billingData.valorFixoBase)} = ${formatCurrencyBR(billingData.valorTotalGeral)}`
        : `${billingData.totalAtendimentos} atendimento(s) calculados conforme tabela técnica de serviços = ${formatCurrencyBR(billingData.valorTotalGeral)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Demonstrativo de Cobrança - ${billingData.empresaSelecionada} - ${billingData.mesNome}/${billingData.ano}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; background: #f1f5f9; margin: 0; padding: 24px; }
    .page { max-width: 960px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px; box-shadow: 0 10px 30px rgba(15,23,42,0.08); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
    .badge { display: inline-block; background: #eef2ff; color: #4338ca; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
    .summary-box.highlight { background: linear-gradient(135deg, #312e81, #4f46e5); color: #ffffff; border: none; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13px; }
    th { background: #1e293b; color: #ffffff; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .disclaimer { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 14px 18px; border-radius: 10px; font-size: 12px; line-height: 1.5; margin-top: 20px; }
    .actions-bar { max-width: 960px; margin: 0 auto 16px auto; display: flex; justify-content: flex-end; gap: 12px; }
    .btn { background: #4f46e5; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; padding: 0; }
      .actions-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="actions-bar">
    <button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  </div>
  <div class="page">
    <div class="header">
      <div>
        <span class="badge">RELATÓRIO TÉCNICO DE ATENDIMENTOS REMOTOS</span>
        <h1 style="margin:10px 0 4px 0;font-size:24px;color:#0f172a;">Demonstrativo Mensal de Serviços & Cobrança</h1>
        <p style="margin:0;color:#475569;font-size:14px;">Responsável Técnico: <strong>Israel Diacov</strong> (${ownerEmail})</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:13px;color:#64748b;">Período de Referência</p>
        <p style="margin:2px 0 6px 0;font-size:18px;font-weight:800;color:#312e81;">${billingData.mesNome} / ${billingData.ano}</p>
        <p style="margin:0;font-size:12px;color:#64748b;">Emitido em: ${billingData.geradoEm}</p>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-box">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;">Empresa Contratante</div>
        <div style="font-size:18px;font-weight:800;margin-top:6px;color:#0f172a;">${billingData.empresaSelecionada}</div>
        <div style="font-size:12px;color:#475569;margin-top:4px;">Modalidade: Suporte 100% Remoto</div>
      </div>
      <div class="summary-box">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:600;">Resumo do Cálculo</div>
        <div style="font-size:14px;font-weight:700;margin-top:6px;color:#1e293b;">${resumoFormula}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Chave PIX: <strong>${pixKey}</strong></div>
      </div>
      <div class="summary-box highlight">
        <div style="font-size:12px;opacity:0.85;text-transform:uppercase;font-weight:600;">Total Líquido a Faturar</div>
        <div style="font-size:26px;font-weight:900;margin-top:6px;">${formatCurrencyBR(billingData.valorTotalGeral)}</div>
        <div style="font-size:12px;opacity:0.9;margin-top:4px;">${billingData.totalAtendimentos} chamado(s) aceito(s) no mês</div>
      </div>
    </div>

    <h3 style="margin:0 0 10px 0;font-size:15px;color:#1e293b;">1. Discriminação dos Chamados Remotos Realizados</h3>
    <table>
      <thead>
        <tr>
          <th>Chamado</th>
          <th>Data / Horário (+15m)</th>
          <th>Empresa</th>
          <th>Funcionário / WhatsApp</th>
          <th>Serviços Executados</th>
          <th style="text-align:right;">Valor Mão de Obra</th>
        </tr>
      </thead>
      <tbody>
        ${rowsChamadosHtml}
      </tbody>
    </table>

    <h3 style="margin:0 0 10px 0;font-size:15px;color:#1e293b;">2. Espelho Diário do Mês (${billingData.mesNome}/${billingData.ano} - Dias 01 a ${billingData.linhasDiasDoMes.length})</h3>
    <table>
      <thead>
        <tr>
          <th>Dia do Mês</th>
          <th style="text-align:center;">Qtd.</th>
          <th>Solicitantes Atendidos</th>
          <th>Resumo dos Serviços</th>
          <th style="text-align:right;">Subtotal do Dia</th>
        </tr>
      </thead>
      <tbody>
        ${rowsDiasMesHtml}
      </tbody>
    </table>

    <div class="disclaimer">
      <strong>⚖️ ${billingData.declaracaoLicencas}</strong>
    </div>
  </div>
</body>
</html>`;
  }

  return {
    MESES,
    DECLARACAO_LICENCAS,
    formatCurrencyBR,
    generateMonthlyBillingData,
    buildStandaloneReportHtml
  };
})();
