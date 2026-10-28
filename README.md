# 💻 Diacov — Suporte Técnico & Soluções em TI Remota

Portal corporativo de agendamento de chamados técnicos remotos, projetado para hospedagem no **GitHub Pages** com validação por códigos embaralhados (`Salt + SHA-256`) e integração privada via **Google Apps Script**.

---

## ✨ Fluxo de Uso para o Cliente

1. **Vitrine de Serviços & Login:**
   - A página inicial apresenta os serviços realizados remotamente e solicita a senha de acesso fornecida à empresa conveniada.
2. **Calendário de Disponibilidade:**
   - Após o login, o cliente visualiza o calendário mensal com os **horários já ocupados** e os dias livres.
3. **Agendamento em 3 Etapas (Modal Passo a Passo):**
   - **Página 1:** Ao clicar no dia desejado, o modal abre exibindo os horários ocupados daquele dia e solicita a sugestão de dia e horário.
   - **Página 2:** Seleção de um ou mais programas/serviços (montando o texto automaticamente na caixa de descrição com espaço livre para observações) e aviso sobre licenças originais.
   - **Página 3:** Identificação da empresa, nome/setor e WhatsApp obrigatório. Ao clicar em **Concluir**, o sistema valida todos os campos, solicita a confirmação final (*"Tem certeza?"*) e envia automaticamente para o suporte técnico.

---

## 🔒 Segurança e Privacidade

- **Zero Senha Exposta no Código:** Nenhuma senha em texto puro ou credencial pessoal consta nos arquivos públicos do repositório.
- **Autenticação Embaralhada (`acessos_seguranca.csv`):** Os acessos utilizam combinação de `Salt + Reversão + Hash SHA-256` armazenada no arquivo `acessos_seguranca.csv` dentro da pasta privada do Google Drive.
- **Configuração Privada de Nuvem:** Os parâmetros de conexão com o Google Apps Script e WhatsApp são configurados exclusivamente dentro da Área Técnica protegida.

---

## 🚀 Publicação no GitHub Pages

1. Envie os arquivos da aplicação (`index.html`, `relatorio-template.html` e a pasta `assets/`) para o repositório no GitHub.
2.*(Importante)* A pasta `google-backend/` contém o script `Code.gs` que deve ser colado diretamente no seu painel privado em [script.google.com](https://script.google.com/) — não sendo necessário enviá-la ao repositório público se desejar mantê-la apenas localmente.
3. Em **Settings ➔ Pages**, selecione a branch principal e salve.
