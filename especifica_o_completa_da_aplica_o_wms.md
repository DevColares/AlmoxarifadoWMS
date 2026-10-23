# Prompt de Especificação Completa para IDE - App WMS Separação de Materiais

Este documento contém a especificação técnica detalhada e o prompt estruturado para ser utilizado em IDEs de desenvolvimento com IA (Cursor, Windsurf, GitHub Copilot, V0, etc.) para criar o aplicativo completo de **Separação de Materiais e WMS em Tempo Real**.

---

## 🚀 PROMPT PRINCIPAL PARA A IDE

> Copie todo o bloco abaixo e cole na sua IDE (ex: Cursor / Windsurf / Claude Code) para construir a aplicação:

```text
Você é um Engenheiro de Software Fullstack Sênior especialista em React, Tailwind CSS e Firebase Firestore.

Sua tarefa é implementar uma aplicação Web WMS (Warehouse Management System) para separação de materiais em almoxarifados, otimizada para dispositivos móveis e desktops.

### 🎯 OBJETIVOS DA APLICAÇÃO

O sistema automatiza o fluxo de separação do almoxarifado a partir da captura da imagem de uma lista impressa de materiais até a entrega final ao cliente no balcão.

---

### 👤 1. GESTÃO DE PERFIS DE USUÁRIO (SEM AUTENTICAÇÃO POR SENHA)
- **Autenticação Transparente:** Utilize `signInAnonymously` do Firebase Auth em segundo plano para conceder permissão imediata de leitura/escrita no Firestore sem telas de login ou senhas.
- **Seletor Operacional:** Um menu suspenso no cabeçalho para alternar dinamicamente o perfil ativo do dispositivo local:
  1. `Carlos Eduardo` (Líder de Almoxarifado)
  2. `Andelison Colares` (Separador / Operador)
  3. `Lucas Silva` (Separador / Operador)
- **Acesso do Líder:** O Líder possui acesso total para criar requisições (via foto ou preset), mas **TAMBÉM PODE ASSUMIR** e executar separações diretamente no checklist.

---

### 🔄 2. FLUXO DE TRABALHO E STATUS DAS REQUISIÇÕES

O documento de cada requisição transita pelos seguintes estados:

1. **`PENDENTE`**:
   - Criada pelo Líder após a extração da foto/preset.
   - Visível na Fila Geral para toda a equipe em tempo real.
   - Exibe o botão **"Assumir Separação (Nome do Usuário)"**.

2. **`EM_SEPARACAO`**:
   - Assumida por um operador/líder.
   - O cronômetro de separação em tempo real é ativado (grava `data_inicio`).
   - Todos os dispositivos visualizam o badge: `"EM SEPARAÇÃO por [Nome]"`.
   - Abre a tela de Checklist com endereço de localização e checkboxes.

3. **`PAUSADO`**:
   - Ativado caso o operador precise interromper a contagem (ex: divergência de saldo, falta de etiqueta, consulta ao líder).
   - Exibe modal para selecionar ou digitar o motivo da pausa.
   - O tempo de separação fica suspenso até o botão "Retomar" ser acionado.

4. **`AGUARDANDO_RETIRADA`** (Status Intermediário):
   - Ativado quando o operador marca 100% dos itens no checklist e clica em **"Concluir Separação de Materiais"**.
   - **O cronômetro é travado** e a duração total em segundos é salva no banco.
   - No Painel Geral, o card ganha destaque com badge amarelo/azul reluzente e o botão **"Cliente Chegou! Entregar Material"**.

5. **`ENTREGUE`**:
   - Ativado quando o cliente/transporte retira o material no balcão e o botão de entrega no painel é acionado.
   - Grava o carimbo de data `data_entrega` e finaliza o ciclo do pedido.

---

### 📊 3. PAINEL DE MÉTRICAS & DESEMPENHO
Exiba um painel consolidando indicadores do Firestore:
- Total de Separações Concluídas.
- Tempo Médio de Separação (calculado em segundos e formatado em `MM:SS`).
- Histórico com filtro de busca por número de nota ou operador responsável.

---

### 🗄️ 4. SCHEMA DE DADOS NO FIRESTORE (`requisicoes` collection)

```json
{
  "id": "REQ-1001",
  "numero_nota": "NF-10485",
  "solicitante": "Comercial - Pedido #8841",
  "status": "EM_SEPARACAO", // PENDENTE, EM_SEPARACAO, PAUSADO, AGUARDANDO_RETIRADA, ENTREGUE
  "criado_por": "Carlos Eduardo",
  "data_criacao": "2026-10-22T21:40:00Z",
  "separador_id": "usr_andelison",
  "separador_nome": "Andelison Colares",
  "tempo_segundos": 345,
  "data_inicio": "2026-10-22T21:42:00Z",
  "data_conclusao_separacao": "2026-10-22T21:47:45Z",
  "data_entrega": null,
  "motivo_pausa": null,
  "itens": [
    {
      "codigo": "MAT-0045",
      "nome": "Cabo Flexível 10mm² Preto 750V",
      "localizacao": "A-01-02",
      "quantidade": "50 metros",
      "separado": true
    },
    {
      "codigo": "MAT-0120",
      "nome": "Disjuntor Din 40A Tripolar Curva C",
      "localizacao": "A-02-05",
      "quantidade": "4 unidades",
      "separado": false
    }
  ]
}
```

---

### 🤖 5. INTEGRAÇÃO DE EXTRAÇÃO DE IA (CAMERA / OCR)
Inclua uma aba de simulação/upload de foto onde a IA extrai a lista e converte em JSON estruturado com o seguinte System Prompt:

```
Analise a imagem da requisição/nota e retorne EXCLUSIVAMENTE um objeto JSON estrito no seguinte formato:
{
  "numero_ficha": "42947",
  "atendimento": "6507843",
  "data_emissao": "22/10/2026",
  "cliente": "60202 TEMA TRANSPORTES ESPECIAL DE",
  "tipo_pagamento": "PARCELADO - 30/60",
  "vendedor": "NORONHA",
  "filial": "DCCO NORTE SOLUCOES EM ENER E EQUIP LTDA",
  "itens": [
    {
      "codigo_peca": "FF57061",
      "descricao": "FILTRO DE COMBUSTIVEL CS191008",
      "locacao": "26A01",
      "quantidade": 2,
      "separado": false
    },
    {
      "codigo_peca": "FF42134",
      "descricao": "FILTRO DE COMBUSTIVEL CS1427452",
      "locacao": "26B01",
      "quantidade": 3,
      "separado": false
    },
    {
      "codigo_peca": "LF163521",
      "descricao": "FILTRO DE OLEO LUBRIFICANTE CS192507",
      "locacao": "26G01",
      "quantidade": 3,
      "separado": false
    },
    {
      "codigo_peca": "LF16452",
      "descricao": "FILTRO DE OLEO LUBRIFICANTE16452",
      "locacao": "26H01",
      "quantidade": 3,
      "separado": false
    }
  ]
}
```

---

### 🎨 6. DIRETRILZES DE DESIGN E UI/UX
- **Estilo:** Dark Mode moderno (Tailwind `slate-900`, `slate-800`, destaques em `emerald-500`, `amber-500`, `indigo-500`).
- **Iconografia:** Utilize Lucide Icons (`Camera`, `CheckSquare`, `Clock`, `UserCheck`, `Truck`, `Pause`, `Play`, `Zap`, `Wifi`).
- **Layout Responsivo:** Otimizado para celular na mão do operador no corredor do estoque e para tablets/monitores no balcão do líder.
```

---

## 📁 Estrutura do Arquivo de Especificação

1. **`spec_aplicacao_wms.md`**: Este guia que especifica as regras de negócio, os estados da aplicação, schemas e prompt principal.
2. **`App.jsx`**: O protótipo React gerado com suporte nativo ao Firebase Firestore em tempo real.
3. **`prompt_extracao_ia.md`**: O prompt para a API do Gemini Vision para extrair o JSON diretamente da câmera.

---

### 💡 Dica para uso no Cursor / Windsurf:
Para gerar todo o código automaticamente na sua IDE:
1. Crie um arquivo chamado `PROMPT.md` na raiz do seu projeto.
2. Cole o conteúdo deste arquivo.
3. No chat do Cursor/Windsurf (Ctrl+L / Cmd+L ou Composer), digite:  
   `@PROMPT.md crie os componentes React e a conexão Firebase de acordo com a especificação.`
```

I have created the markdown specification document (`spec_aplicacao_wms.md`). It contains the prompt, application states, Firestore schemas, UI guidelines, and instructions on how to use it in IDEs like Cursor, Windsurf, or Copilot.