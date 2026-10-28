/**
 * ============================================================================
 * MÓDULO DE CATÁLOGO DINÂMICO (empresas.csv & servicos_valores.csv)
 * ============================================================================
 * - Lê e grava os CSVs no Google Drive (com fallback imediato local).
 * - Oculta preços para funcionários na tela de cliente.
 * - Monta automaticamente o texto na caixa de descrição ao adicionar múltiplos
 *   serviços, preservando observações adicionais escritas pelo cliente.
 */

const CatalogManager = (() => {
  const STORAGE_KEYS = {
    COMPANIES_CSV: 'diacov_csv_empresas_v1',
    SERVICES_CSV: 'diacov_csv_servicos_v1'
  };

  const DEFAULT_COMPANIES_CSV = [
    'id;nome_empresa;contato_responsavel;ativo',
    'EMP-01;RFranco Engenharia;Setor Administrativo / TI;SIM',
    'EMP-02;Eleva Andaimes;Setor Administrativo / Operações;SIM'
  ].join('\n');

  const DEFAULT_SERVICES_CSV = [
    'codigo;nome_servico;dificuldade;duracao_minutos;valor_mao_de_obra;texto_automatico',
    'SRV-01;Adobe Acrobat Reader / Utilitários Básicos (WinRAR, 7-Zip, Navegadores);Baixa;20;40.00;[Instalação/Configuração] Adobe Acrobat Reader e utilitários essenciais do sistema',
    'SRV-02;Configuração de E-mail Corporativo (Outlook / Webmail) + Assinatura;Baixa / Média;30;55.00;[Configuração de E-mail] Conta corporativa no Outlook/Webmail incluindo padronização de assinatura',
    'SRV-03;Configuração de Impressora em Rede / Scanner e Drivers;Média;30;60.00;[Periféricos/Rede] Instalação e configuração de impressora em rede / scanner e drivers',
    'SRV-04;Correção de Problemas no Windows (Lentidão, Limpeza, Erros de Sistema, Rede);Média;45;70.00;[Manutenção Windows] Diagnóstico e correção de problemas no Windows (otimização, erros e ajustes)',
    'SRV-05;Pacote Microsoft Office (Word, Excel, PowerPoint, Outlook - Instalar/Reinstalar);Média;40;75.00;[Instalação/Reinstalação] Pacote Microsoft Office (Word, Excel, PowerPoint e Outlook) com licença do cliente',
    'SRV-06;Microsoft Project ou Microsoft Visio (Instalação e Ativação);Média;40;80.00;[Instalação] Microsoft Project / Microsoft Visio com licença original do cliente',
    'SRV-07;Backup / Migração de Dados e Perfil de Usuário do Windows;Média / Alta;50;90.00;[Backup e Migração] Cópia segura e organização de arquivos/perfil de usuário no Windows',
    'SRV-08;Adobe Photoshop ou CorelDraw (Instalação, Performance e Ativação);Média / Alta;45;95.00;[Instalação Gráfica] Adobe Photoshop / CorelDraw configurado com licença original do cliente',
    'SRV-09;Autodesk AutoCAD (Instalação Completa, Plotters/Idioma e Ativação);Alta;60;120.00;[Instalação Engenharia] Autodesk AutoCAD (configuração completa e ativação com licença do cliente)',
    'SRV-10;Autodesk Revit (Instalação Completa + Bibliotecas/Templates BIM e Ativação);Muito Alta;75;150.00;[Instalação BIM] Autodesk Revit (instalação completa com bibliotecas/templates e ativação com licença do cliente)',
    'SRV-11;Outro Suporte Remoto / Diagnóstico Técnico Personalizado;Sob Avaliação;30;65.00;[Suporte Remoto] Atendimento técnico personalizado (detalhado nas observações abaixo)'
  ].join('\n');

  const MARKER_NOTES = 'Observações adicionais do cliente:';

  function getCompaniesCsvRaw() {
    return localStorage.getItem(STORAGE_KEYS.COMPANIES_CSV) || DEFAULT_COMPANIES_CSV;
  }

  function setCompaniesCsvRaw(csvText) {
    if (csvText && csvText.trim()) {
      localStorage.setItem(STORAGE_KEYS.COMPANIES_CSV, csvText.trim());
    }
  }

  function getServicesCsvRaw() {
    return localStorage.getItem(STORAGE_KEYS.SERVICES_CSV) || DEFAULT_SERVICES_CSV;
  }

  function setServicesCsvRaw(csvText) {
    if (csvText && csvText.trim()) {
      localStorage.setItem(STORAGE_KEYS.SERVICES_CSV, csvText.trim());
    }
  }

  function parseCompaniesCsv(csvText) {
    const raw = (csvText || getCompaniesCsvRaw()).trim();
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];

    return lines.slice(1).map((line, idx) => {
      const cols = line.split(';').map(c => c.trim());
      return {
        id: cols[0] || `EMP-0${idx + 1}`,
        nome: cols[1] || 'Empresa',
        responsavel: cols[2] || 'Setor Responsável',
        ativo: (cols[3] || 'SIM').toUpperCase() !== 'NAO'
      };
    });
  }

  function serializeCompaniesToCsv(companiesList) {
    const header = 'id;nome_empresa;contato_responsavel;ativo';
    const rows = (companiesList || []).map((c, idx) => {
      const id = c.id || `EMP-${String(idx + 1).padStart(2, '0')}`;
      const nome = String(c.nome || '').replace(/;/g, ',').trim();
      const resp = String(c.responsavel || 'Setor Administrativo').replace(/;/g, ',').trim();
      const ativo = c.ativo === false ? 'NAO' : 'SIM';
      return `${id};${nome};${resp};${ativo}`;
    });
    return [header, ...rows].join('\n');
  }

  function parseServicesCsv(csvText) {
    const raw = (csvText || getServicesCsvRaw()).trim();
    const lines = raw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];

    const headerCols = lines[0].split(';').map(c => c.trim());
    const hasPriceColumn = headerCols.includes('valor_mao_de_obra');

    return lines.slice(1).map((line, idx) => {
      const cols = line.split(';').map(c => c.trim());
      if (hasPriceColumn) {
        return {
          codigo: cols[0] || `SRV-${String(idx + 1).padStart(2, '0')}`,
          nome: cols[1] || 'Serviço Remoto',
          dificuldade: cols[2] || 'Média',
          duracaoMinutos: Number(cols[3]) || 30,
          valorMaoDeObra: Number(String(cols[4] || '0').replace(',', '.')) || 0,
          textoAutomatico: cols[5] || `[Serviço] ${cols[1] || ''}`
        };
      } else {
        // Caso venha da rota pública sem coluna de preço, cruza com a referência interna apenas para cálculo no admin
        const defaultMatch = parseServicesCsv(DEFAULT_SERVICES_CSV).find(s => s.codigo === cols[0]);
        return {
          codigo: cols[0] || `SRV-${String(idx + 1).padStart(2, '0')}`,
          nome: cols[1] || 'Serviço Remoto',
          dificuldade: cols[2] || 'Média',
          duracaoMinutos: Number(cols[3]) || 30,
          valorMaoDeObra: defaultMatch ? defaultMatch.valorMaoDeObra : 65,
          textoAutomatico: cols[4] || `[Serviço] ${cols[1] || ''}`
        };
      }
    });
  }

  function serializeServicesToCsv(servicesList) {
    const header = 'codigo;nome_servico;dificuldade;duracao_minutos;valor_mao_de_obra;texto_automatico';
    const rows = (servicesList || []).map((s, idx) => {
      const codigo = s.codigo || `SRV-${String(idx + 1).padStart(2, '0')}`;
      const nome = String(s.nome || '').replace(/;/g, ',').trim();
      const dif = String(s.dificuldade || 'Média').replace(/;/g, ',').trim();
      const dur = Number(s.duracaoMinutos) || 30;
      const val = (Number(s.valorMaoDeObra) || 0).toFixed(2);
      const txt = String(s.textoAutomatico || `[Serviço] ${nome}`).replace(/;/g, ',').trim();
      return `${codigo};${nome};${dif};${dur};${val};${txt}`;
    });
    return [header, ...rows].join('\n');
  }

  /**
   * Monta o texto estruturado na caixa de descrição combinando os serviços
   * selecionados + o espaço livre para o cliente digitar observações extras.
   */
  function buildTicketDescriptionWithServices(selectedServiceCodes, currentTextareaValue) {
    const allServices = parseServicesCsv();
    const selectedObjects = selectedServiceCodes
      .map(code => allServices.find(s => s.codigo === code))
      .filter(Boolean);

    // Extrai o que o cliente já escreveu depois do marcador "Observações adicionais do cliente:"
    let userCustomNotes = '';
    const currentText = String(currentTextareaValue || '');

    if (currentText.includes(MARKER_NOTES)) {
      const parts = currentText.split(MARKER_NOTES);
      userCustomNotes = parts.slice(1).join(MARKER_NOTES).replace(/^\r?\n/, '');
    } else if (
      !currentText.startsWith('Serviços remotos solicitados:') &&
      currentText.trim().length > 0
    ) {
      userCustomNotes = currentText.trim();
    }

    if (selectedObjects.length === 0) {
      return userCustomNotes;
    }

    const bulletLines = selectedObjects.map((srv, idx) => `• ${idx + 1}. ${srv.textoAutomatico}`);

    return [
      'Serviços remotos solicitados:',
      ...bulletLines,
      '',
      MARKER_NOTES,
      userCustomNotes || ''
    ].join('\n');
  }

  /**
   * Calcula a duração sugerida e o valor total da mão de obra com base nos serviços escolhidos
   */
  function calculateServicesSummary(selectedServiceCodes) {
    const allServices = parseServicesCsv();
    const selectedObjects = (selectedServiceCodes || [])
      .map(code => allServices.find(s => s.codigo === code))
      .filter(Boolean);

    if (selectedObjects.length === 0) {
      return {
        duracaoMinutos: 30,
        valorTotal: 65.0,
        nomes: ['Suporte Remoto Geral'],
        codigos: []
      };
    }

    // Quando há múltiplos serviços na mesma sessão remota, soma-se o valor de mão de obra
    // e otimiza-se o tempo de conexão (100% do mais longo + 65% dos adicionais)
    const sortedByDuration = [...selectedObjects].sort((a, b) => b.duracaoMinutos - a.duracaoMinutos);
    const totalDuration = sortedByDuration.reduce((acc, srv, idx) => {
      return acc + (idx === 0 ? srv.duracaoMinutos : Math.round(srv.duracaoMinutos * 0.65));
    }, 0);

    const totalPrice = selectedObjects.reduce((acc, srv) => acc + (Number(srv.valorMaoDeObra) || 0), 0);

    return {
      duracaoMinutos: Math.max(20, Math.min(240, totalDuration)),
      valorTotal: Number(totalPrice.toFixed(2)),
      nomes: selectedObjects.map(s => s.nome),
      codigos: selectedObjects.map(s => s.codigo),
      itensDetalhados: selectedObjects.map(s => ({
        codigo: s.codigo,
        nome: s.nome,
        dificuldade: s.dificuldade,
        valor: s.valorMaoDeObra
      }))
    };
  }

  function downloadCsvFile(filename, content) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    getCompaniesCsvRaw,
    setCompaniesCsvRaw,
    getServicesCsvRaw,
    setServicesCsvRaw,
    parseCompaniesCsv,
    serializeCompaniesToCsv,
    parseServicesCsv,
    serializeServicesToCsv,
    buildTicketDescriptionWithServices,
    calculateServicesSummary,
    downloadCsvFile,
    DEFAULT_COMPANIES_CSV,
    DEFAULT_SERVICES_CSV,
    MARKER_NOTES
  };
})();
