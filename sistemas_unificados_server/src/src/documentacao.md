

# 📘 **DOCUMENTAÇÃO TÉCNICA E MANUAL DO USUÁRIO**

## Sistema de Monitoramento de Impressoras - SEPROR/GILOG

---

## 📌 **Sumário**

1. [Visão Geral](#visão-geral)
2. [Funcionamento da Aplicação (SNMP)](#funcionamento-da-aplicação-snmp)
3. [Interface: Dashboard](#interface-dashboard)
4. [Interface: Página de Cadastro](#interface-página-de-cadastro)
5. [Fluxograma do Processo SNMP](#fluxograma-do-processo-snmp)
6. [Considerações Finais](#considerações-finais)

---

## 🌐 **Visão Geral**

O sistema web de **monitoramento de impressoras** tem como objetivo fornecer uma interface clara, dinâmica e centralizada para acompanhamento do status, nível de toner, contador de uso e detalhes técnicos das impressoras conectadas à rede interna da instituição.

A comunicação com os dispositivos ocorre por meio do **protocolo SNMP (Simple Network Management Protocol)**, garantindo a leitura em tempo real das informações diretamente dos equipamentos.

---

## 🔄 **Funcionamento da Aplicação (SNMP)**

A base do funcionamento da aplicação se dá por meio de **consultas SNMP** às impressoras cadastradas. O sistema realiza requisições a cada equipamento informando um conjunto de **OIDs (Object Identifiers)** para obter:

* Estado atual da impressora (descanso, imprimindo, erro, aquecendo)
* Contador de impressões
* Porcentagem dos toners
* Número de série
* Estado do tambor
* Códigos de erro

A impressora, então, **responde com os valores correspondentes**, e esses dados são utilizados para **alimentar dinamicamente o dashboard** da aplicação.

---

## 🖥️ **Interface: Dashboard**

### 🧩 **Componentes Principais**

#### ✅ Botões de Impressoras

Cada impressora cadastrada é exibida na forma de um **botão** com os seguintes elementos visuais:

| Elemento                   | Detalhes                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nome da Impressora**     | Exibido no topo do botão                                                                                                                            |
| **Endereço IP**            | Mostrado abaixo do nome                                                                                                                             |
| **Status Atual**           | Apresentado em **cor dinâmica**: <br> 🔵 **Azul**: descanso <br> 🟢 **Verde**: imprimindo <br> 🟠 **Laranja**: aquecendo <br> 🔴 **Vermelho**: erro |
| **Contador de Impressões** | Mostrado como número total de impressões realizadas                                                                                                 |
| **Níveis de Toner**        | Exibido com barras de cores para representar os percentuais. As cores seguem: <br>🟢 > 70%<br>🟡 30% a 69%<br>🔴 < 30%                              |

#### 🔍 **Modal Detalhado**

Ao clicar sobre um botão de impressora, um **modal** com mais informações é exibido:

* Todos os dados do botão
* Número de série da impressora
* Estado atual do tambor
* Informações detalhadas sobre códigos de erro

---

### 📁 **Menu Superior**

O menu fixo no topo da aplicação contém:

* 🔘 **Botão "Cadastrar Impressora"** – redireciona para a **página de cadastro** de novas impressoras.

---

## 📝 **Interface: Página de Cadastro**

### 📌 **1. Campos para Inserção**

Área destinada ao cadastro de novas impressoras:

* **Nome da Impressora** – campo de texto para identificação da impressora
* **Endereço IP** – campo para IP da impressora na rede
* 🔒 Ao enviar, os dados são gravados no **banco de dados PostgreSQL**

### 📋 **2. Lista de Impressoras**

Abaixo do formulário de cadastro:

* Tabela com **todas as impressoras já cadastradas**
* Ações disponíveis por impressora:

  * ✏️ **Editar** – permite alterar o nome/IP da impressora
  * 🗑️ **Excluir** – remove a impressora do sistema

---

## 📊 **Fluxograma do Processo SNMP**

```mermaid

    A[Usuário acessa o Dashboard] --> B[Aplicação coleta lista de impressoras do banco]

    B --> C[Para cada impressora, executa consulta SNMP]

    C --> D{Impressora responde?}

    D -- Sim --> E[Coleta de dados: status, toner, contador, serial, tambor, erros]

    E --> F[Renderiza botão da impressora no Dashboard]

    D -- Não --> G[Exibe status de erro ou offline]

    F --> H[Atualiza automaticamente com base no tempo de resposta da impressora]
```

---

## 🛠️ **Considerações Técnicas**

* **Backend:** Node.js + Express
* **Frontend:** HTML/CSS/JS puro 
* **Banco de Dados:** PostgreSQL
* **Comunicação de Impressoras:** SNMP v1/v2c
* **Atualização automática:** página com meta refresh para eventuais correções(ex: a cada 10 minutos)

---

## ✅ **Considerações Finais**

Esta aplicação é essencial para o **gerenciamento técnico e operacional** das impressoras em ambientes corporativos, promovendo:

* Economia de tempo com detecção proativa de erros
* Monitoramento contínuo dos níveis de toner
* Visão consolidada do parque de impressão
* Facilidade na manutenção preventiva

