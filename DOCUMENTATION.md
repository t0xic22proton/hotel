# Resort Fazenda São João - Sistema de Reservas Fullstack

## Visão Geral

Sistema completo de reservas online para o Resort Fazenda São João, desenvolvido com React, Node.js, tRPC e integração segura com BuckPay para pagamentos PIX.

## Arquitetura

### Frontend (React + TypeScript)
- **Página de Reservas** (`/reservas`): Interface para seleção de acomodações, preenchimento de dados e checkout
- **Painel Administrativo** (`/admin`): Dashboard com métricas de funil e listagem de reservas
- **Autenticação**: Login por senha única (variável `ADMIN_PASSWORD`), sessão via cookie JWT assinado

### Backend (Node.js + Express + tRPC)
- **Procedures tRPC**: Endpoints tipados para todas as operações
- **Banco de Dados**: Postgres (Supabase) com Drizzle ORM
- **Segurança**: Token BuckPay protegido no servidor, validação de dados com Zod

### Banco de Dados
- **accommodation_types**: Catálogo de acomodações
- **reservations**: Registro de todas as reservas
- **funnel_events**: Rastreamento anônimo de conversão

## Funcionalidades

### Para Hóspedes

#### 1. Página de Reservas (`/reservas`)
- Visualizar 3 tipos de acomodações (Apartamento, Suíte, Suíte Família)
- Selecionar acomodação desejada
- Preencher dados pessoais (nome, CPF, e-mail, telefone)
- Visualizar resumo da reserva
- Realizar pagamento via PIX (taxa de agendamento de R$ 500,00)

#### 2. Fluxo de Pagamento
- Taxa de agendamento: R$ 500,00 (descontada do valor final)
- Método: PIX
- QR Code gerado automaticamente
- Reembolso integral em até 7 dias em caso de desistência

#### 3. Rastreamento Anônimo
- Visita à página é registrada automaticamente
- Abertura do checkout é rastreada
- Confirmação de pagamento é registrada
- **Sem coleta de IP ou dados pessoais para rastreamento**

### Para Administradores

#### 1. Acesso ao Painel (`/admin`)
- Requer autenticação com role `admin`
- Acesso restrito apenas a usuários autorizados

#### 2. Métricas de Funil
- **Visitas**: Total de acessos à página de reservas
- **Checkouts Abertos**: Quantas vezes o modal de checkout foi aberto
- **Pagamentos Confirmados**: Transações PIX completadas
- **Taxa de Conversão**: Cálculo automático em cada etapa

#### 3. Listagem de Reservas
- Tabela com todas as reservas
- Filtro por nome, e-mail ou telefone
- Filtro por status (Pendente, Confirmada, Cancelada, Concluída)
- Informações: hóspede, e-mail, telefone, datas, status, valor da taxa

## Segurança

### Proteção de Dados Sensíveis
- **Token BuckPay**: Armazenado apenas no servidor, nunca exposto no frontend
- **Validação de Entrada**: Todos os dados validados com Zod no backend
- **Autenticação**: Senha única de admin (`ADMIN_PASSWORD`), comparada com `timingSafeEqual`; sessão via cookie JWT (HS256) assinado com `JWT_SECRET`
- **Autorização**: Procedures tRPC protegidas por role (admin/user)
- **RLS no Supabase**: Row Level Security ativa em todas as tabelas, sem policies — acesso só via `DATABASE_URL` no server, nunca do client

### Rastreamento Responsável
- **Sem Google Analytics**: Rastreamento interno apenas
- **Sem Cookies de Terceiros**: Apenas cookies de sessão
- **Sem IP Tracking**: Apenas contadores anônimos por sessão
- **LGPD Compliant**: Sem coleta desnecessária de dados pessoais

## Estrutura de Arquivos

```
/client
  /src
    /pages
      Reservations.tsx      # Página de reservas
      AdminDashboard.tsx    # Painel administrativo
    /components            # Componentes reutilizáveis
    reservas.css          # Estilos do sistema de reservas

/server
  /routers.ts            # Procedures tRPC
  /db.ts                 # Helpers de banco de dados
  /buckpay.test.ts       # Testes de integração BuckPay

/drizzle
  /schema.ts             # Definição das tabelas
  /migrations            # Migrações do banco de dados
```

## Procedures tRPC Disponíveis

### Públicas (Sem Autenticação)

#### `reservations.trackEvent`
Rastreia eventos do funil de conversão.
```typescript
{
  eventType: 'page_visit' | 'checkout_opened' | 'payment_confirmed',
  sessionId: string // UUID anônimo
}
```

#### `reservations.create`
Salva uma nova reserva no banco de dados.
```typescript
{
  externalId: string,
  accommodationId: number,
  guestName: string,
  guestEmail: string,
  guestPhone?: string,
  guestCpf?: string,
  checkInDate: Date,
  checkOutDate: Date,
  numberOfGuests: number,
  observations?: string,
  bookingFee: number
}
```

#### `buckpay.createTransaction`
Cria uma transação PIX com a BuckPay.
```typescript
{
  externalId: string,
  amount: number, // em centavos
  buyerName: string,
  buyerEmail: string,
  buyerCpf?: string,
  buyerPhone?: string
}
```

#### `buckpay.getTransactionStatus`
Consulta o status de uma transação.
```typescript
input: string // external_id
```

### Protegidas (Requer Admin)

#### `reservations.getFunnelMetrics`
Retorna métricas de conversão.
```typescript
// Retorna array de métricas com event_type e count
```

#### `reservations.list`
Lista todas as reservas.
```typescript
// Retorna array de reservas com todos os dados
```

#### `reservations.getByExternalId`
Obtém uma reserva específica.
```typescript
input: string // external_id
```

#### `reservations.updateStatus`
Atualiza o status de uma reserva.
```typescript
{
  externalId: string,
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed',
  buckpayTransactionId?: string,
  buckpayStatus?: string
}
```

## Variáveis de Ambiente

```env
# Banco de Dados (Supabase Postgres — usar Session pooler local/Render, Transaction pooler se serverless)
DATABASE_URL=postgresql://user:password@host:port/postgres

# Autenticação
JWT_SECRET=string aleatória longa (assina o cookie de sessão)
ADMIN_PASSWORD=senha do painel /admin

# BuckPay (OBRIGATÓRIO)
BUCKPAY_TOKEN=sk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Fluxo de Reserva Completo

### 1. Hóspede Acessa `/reservas`
- Evento `page_visit` é registrado
- Sessão anônima é criada (UUID)

### 2. Seleciona Acomodação
- Preenche dados pessoais
- Visualiza resumo

### 3. Clica em "Finalizar Reserva"
- Evento `checkout_opened` é registrado
- Reserva é salva no banco com status `pending`
- Transação PIX é criada na BuckPay

### 4. Recebe QR Code PIX
- Modal exibe QR Code
- Código PIX é copiável
- Hóspede realiza pagamento

### 5. Pagamento Confirmado
- Evento `payment_confirmed` é registrado
- Status da reserva muda para `confirmed`
- Hóspede recebe confirmação

### 6. Admin Visualiza no Painel
- Acessa `/admin`
- Vê métricas de funil
- Filtra e visualiza reservas

## Testes

### Executar Testes
```bash
pnpm test
```

### Testes Inclusos
- `auth.logout.test.ts`: Teste de logout
- `buckpay.test.ts`: Validação de integração BuckPay
  - Token configurado
  - Validação de valores
  - Validação de e-mail
  - Criação de transação

## Deploy

### Pré-requisitos
- Node.js 22+
- Projeto Supabase (Postgres) criado
- Token BuckPay válido

### Passos
1. Clonar repositório
2. Instalar dependências: `pnpm install`
3. Configurar variáveis de ambiente (ver acima)
4. Executar migrações: `pnpm db:push`
5. Build: `pnpm build`
6. Start: `pnpm start`

### Hospedagem (Render)
Processo Node único (Express serve API + build estático do frontend), sem serverless.
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- Configurar `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`, `BUCKPAY_TOKEN` nas env vars do serviço no painel do Render
- Render injeta `PORT` automaticamente — o server já respeita `process.env.PORT`
- SSL incluído pelo Render no domínio `.onrender.com` (ou domínio próprio configurado)

## Troubleshooting

### Erro: "BuckPay API error: 400"
- Verificar se o token está correto
- Validar formato de CPF/telefone
- Consultar logs para detalhes

### Erro: "Failed to create reservation"
- Verificar conexão com banco de dados
- Validar dados de entrada
- Consultar logs do servidor

### Métricas Zeradas
- Verificar se há eventos sendo rastreados
- Consultar tabela `funnel_events`
- Validar sessionId sendo enviado

## Suporte

Para dúvidas ou problemas:
1. Verifique os logs do serviço no Render
2. Verifique a documentação de cada integração
3. Teste as procedures tRPC diretamente
4. Abra uma issue no repositório

## Changelog

### v1.0.0 (Inicial)
- ✅ Sistema completo de reservas
- ✅ Integração BuckPay PIX
- ✅ Painel administrativo
- ✅ Rastreamento de funil
- ✅ Autenticação por senha (admin)
- ✅ Testes automatizados

### v1.1.0
- ✅ Migração do banco de dados de MySQL para Postgres (Supabase)
- ✅ Remoção de dependências da plataforma Manus (OAuth, Forge API, storage, analytics)
- ✅ Login do painel admin substituído por senha única (`ADMIN_PASSWORD`)
- ✅ Preparado para deploy no Render
