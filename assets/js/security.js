/**
 * ============================================================================
 * MÓDULO DE SEGURANÇA E SENHAS EMBARALHADAS (acessos_seguranca.csv)
 * ============================================================================
 * - Nenhuma senha em texto puro existe no código-fonte.
 * - As senhas são embaralhadas com Salt + Reversão + SHA-256 e lidas/gravadas
 *   no arquivo "acessos_seguranca.csv" no Google Drive.
 * - As senhas da Tela de Cliente e do Painel Admin são obrigatoriamente distintas.
 */

const SecurityManager = (() => {
  const STORAGE_KEYS = {
    SECURITY_CSV: 'diacov_csv_acessos_seguranca_v3',
    CLIENT_SESSION: 'diacov_session_client_v3',
    ADMIN_SESSION: 'diacov_session_admin_v3',
    ENCRYPTED_CLOUD_CFG: 'diacov_cloud_cfg_v1'
  };

  // Remove chaves antigas para garantir o reset imediato no navegador
  try {
    localStorage.removeItem('diacov_csv_acessos_seguranca_v2');
    localStorage.removeItem('diacov_sec_client_hash_v1');
    localStorage.removeItem('diacov_sec_admin_hash_v1');
    sessionStorage.removeItem('diacov_session_client_v2');
    sessionStorage.removeItem('diacov_session_admin_v2');
  } catch (e) {}

  // Conteúdo inicial de acessos_seguranca.csv (apenas hashes embaralhados com salt, ZERO senha exposta)
  const DEFAULT_SECURITY_CSV = [
    'perfil;salt_embaralhador;senha_embaralhada_hash;atualizado_em',
    'CLIENTE;SL-9841-CLI;9c502adbe690ad48bcea7e77ba3386d590e2c21d61d4225ca0331473a9348212;2026-10-27',
    'ADMIN;SL-7729-ADM;ae5f5adb2a331bb86f0b44337b7577a58f8a7f1c45f1b22c8219a0f4492d5357;2026-10-27'
  ].join('\n');

  /**
   * Implementação SHA-256 pura (compatível com HTTPS no GitHub Pages e file:// local)
   */
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
        for (i = 0; i < 313; i += candidate) {
          isComposite[i] = candidate;
        }
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
        const w15 = w[i - 15],
          w2 = w[i - 2];

        const a = hash[0],
          e = hash[4];
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

      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  /**
   * Embaralha a senha combinando Salt + Reversão + Comprimento + SHA-256
   */
  function scramblePasswordWithSalt(plainPassword, salt) {
    const cleanPass = String(plainPassword || '').trim();
    const cleanSalt = String(salt || 'SL-DEFAULT').trim();
    const revPass = cleanPass.split('').reverse().join('');
    const revSalt = cleanSalt.split('').reverse().join('');
    const mixed = `${cleanSalt}::${revPass}::${cleanPass.length}::${revSalt}`;
    return sha256Pure(unescape(encodeURIComponent(mixed)));
  }

  function getSecurityCsvRaw() {
    return localStorage.getItem(STORAGE_KEYS.SECURITY_CSV) || DEFAULT_SECURITY_CSV;
  }

  function setSecurityCsvRaw(csvText) {
    if (csvText && csvText.trim()) {
      localStorage.setItem(STORAGE_KEYS.SECURITY_CSV, csvText.trim());
    }
  }

  function parseSecurityCsv(csvText) {
    const raw = (csvText || getSecurityCsvRaw()).trim();
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const records = {};

    lines.slice(1).forEach(line => {
      const cols = line.split(';').map(c => c.trim());
      if (cols[0]) {
        const role = cols[0].toUpperCase();
        records[role] = {
          perfil: role,
          salt: cols[1] || 'SL-0000',
          hashEmbaralhado: cols[2] || '',
          atualizadoEm: cols[3] || ''
        };
      }
    });

    return records;
  }

  function getExpectedClientHash() {
    const recs = parseSecurityCsv();
    return recs.CLIENTE ? recs.CLIENTE.hashEmbaralhado : '';
  }

  function getExpectedAdminHash() {
    const recs = parseSecurityCsv();
    return recs.ADMIN ? recs.ADMIN.hashEmbaralhado : '';
  }

  function validateClientPassword(inputPassword) {
    const recs = parseSecurityCsv();
    const clientRec = recs.CLIENTE;
    const adminRec = recs.ADMIN;
    if (!clientRec) {
      return { ok: false, error: 'Configuração de segurança não encontrada.' };
    }

    const candidateHash = scramblePasswordWithSalt(inputPassword, clientRec.salt);
    if (candidateHash === clientRec.hashEmbaralhado && candidateHash !== (adminRec && adminRec.hashEmbaralhado)) {
      sessionStorage.setItem(STORAGE_KEYS.CLIENT_SESSION, candidateHash);
      return { ok: true, hash: candidateHash };
    }
    return {
      ok: false,
      error: 'Senha de acesso incorreta. Solicite a senha da sua empresa ao suporte técnico.'
    };
  }

  function validateAdminPassword(inputPassword) {
    const recs = parseSecurityCsv();
    const adminRec = recs.ADMIN;
    const clientRec = recs.CLIENTE;
    if (!adminRec) {
      return { ok: false, error: 'Configuração de administrador não encontrada.' };
    }

    const candidateHash = scramblePasswordWithSalt(inputPassword, adminRec.salt);
    if (candidateHash === adminRec.hashEmbaralhado && candidateHash !== (clientRec && clientRec.hashEmbaralhado)) {
      sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, candidateHash);
      return { ok: true, hash: candidateHash };
    }
    return {
      ok: false,
      error: 'Senha de Administrador inválida. Acesso exclusivo ao responsável técnico.'
    };
  }

  function isClientAuthenticated() {
    const token = sessionStorage.getItem(STORAGE_KEYS.CLIENT_SESSION);
    return Boolean(token && token === getExpectedClientHash());
  }

  function isAdminAuthenticated() {
    const token = sessionStorage.getItem(STORAGE_KEYS.ADMIN_SESSION);
    return Boolean(token && token === getExpectedAdminHash());
  }

  function logoutClient() {
    sessionStorage.removeItem(STORAGE_KEYS.CLIENT_SESSION);
  }

  function logoutAdmin() {
    sessionStorage.removeItem(STORAGE_KEYS.ADMIN_SESSION);
  }

  /**
   * Gera novos Salts, embaralha as novas senhas (garantindo que sejam diferentes)
   * e atualiza o conteúdo de acessos_seguranca.csv
   */
  function updatePasswords(newClientPass, newAdminPass) {
    const clientClean = String(newClientPass || '').trim();
    const adminClean = String(newAdminPass || '').trim();

    if (clientClean.length < 4 || adminClean.length < 6) {
      return {
        ok: false,
        error: 'A senha do cliente deve ter no mínimo 4 caracteres e a do administrador no mínimo 6.'
      };
    }

    if (clientClean.toLowerCase() === adminClean.toLowerCase()) {
      return {
        ok: false,
        error: 'As senhas da Área do Cliente e do Painel Administrativo DEVEM ser diferentes!'
      };
    }

    const rand4 = () => Math.floor(1000 + Math.random() * 9000);
    const clientSalt = `SL-${rand4()}-CLI`;
    const adminSalt = `SL-${rand4()}-ADM`;

    const clientHash = scramblePasswordWithSalt(clientClean, clientSalt);
    const adminHash = scramblePasswordWithSalt(adminClean, adminSalt);
    const today = new Date().toISOString().slice(0, 10);

    const newCsv = [
      'perfil;salt_embaralhador;senha_embaralhada_hash;atualizado_em',
      `CLIENTE;${clientSalt};${clientHash};${today}`,
      `ADMIN;${adminSalt};${adminHash};${today}`
    ].join('\n');

    setSecurityCsvRaw(newCsv);
    sessionStorage.setItem(STORAGE_KEYS.ADMIN_SESSION, adminHash);

    return {
      ok: true,
      clientHash,
      adminHash,
      securityCsv: newCsv
    };
  }

  function saveCloudConfig(configObj) {
    const json = JSON.stringify(configObj || {});
    const encoded = btoa(unescape(encodeURIComponent(json)));
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_CLOUD_CFG, encoded);
  }

  function loadCloudConfig() {
    try {
      const encoded = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_CLOUD_CFG);
      if (!encoded) {
        return {
          gasWebAppUrl: '',
          ownerEmail: '',
          ownerWhatsapp: '',
          callmebotApiKey: '',
          pixKey: '',
          bufferMinutes: 15
        };
      }
      const json = decodeURIComponent(escape(atob(encoded)));
      return JSON.parse(json);
    } catch (e) {
      return {
        gasWebAppUrl: '',
        ownerEmail: '',
        ownerWhatsapp: '',
        callmebotApiKey: '',
        pixKey: '',
        bufferMinutes: 15
      };
    }
  }

  return {
    scramblePasswordWithSalt,
    getSecurityCsvRaw,
    setSecurityCsvRaw,
    parseSecurityCsv,
    validateClientPassword,
    validateAdminPassword,
    isClientAuthenticated,
    isAdminAuthenticated,
    logoutClient,
    logoutAdmin,
    updatePasswords,
    getExpectedClientHash,
    getExpectedAdminHash,
    saveCloudConfig,
    loadCloudConfig
  };
})();
