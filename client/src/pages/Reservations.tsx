import { useEffect, useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import '../reservas.css';

const ACCOMMODATIONS = [
  {
    id: 1,
    name: 'Apartamento',
    description: 'Quarto amplo, varanda em comum e privilegiada vista para áreas verdes. Equipada com ar condicionado, ventilador de teto, wifi, tv, telefone, frigobar e banheiro com aquecimento central.',
    price: 45000,
    amenities: ['Ar condicionado', 'Wi-Fi', 'TV', 'Ventilador', 'Frigobar'],
    image: 'https://hotelfazendasaojoao.com.br/wp-content/uploads/2024/05/hotel2.jpg',
  },
  {
    id: 2,
    name: 'Suíte',
    description: '2 quartos, varanda privativa com rede e vista para piscinas e áreas verdes. Equipada com ar condicionado, ventilador de teto, wifi, tv, telefone, frigobar e banheiro com aquecimento central.',
    price: 65000,
    amenities: ['2 quartos', 'Ar condicionado', 'Wi-Fi', 'TV', 'Banheira'],
    image: '/images/piscinas-capturar1.webp',
    badge: 'Popular',
  },
  {
    id: 3,
    name: 'Suíte Família',
    description: 'Uma suíte, dois quartos com banheiro, área de lazer privativa com churrasqueira e spa. Sala com cozinha americana. Equipada com ar condicionado, wifi, tv a cabo e telefone.',
    price: 95000,
    amenities: ['Churrasqueira', 'Spa', 'Cozinha', 'Ar condicionado', 'Wi-Fi', 'TV a cabo'],
    image: '/images/dji-drone.webp',
    badge: 'Premium',
  },
];

export default function Reservations() {
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [selectedAccommodation, setSelectedAccommodation] = useState<typeof ACCOMMODATIONS[0] | null>(null);
  
  const [checkInDate, setCheckInDate] = useState(new Date(2026, 6, 25));
  const [checkOutDate, setCheckOutDate] = useState(new Date(2026, 6, 26));
  
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    email: '',
    telefone: '',
    dataNascimento: '',
    cep: '',
    observacoes: '',
  });

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<'loading' | 'error' | 'success' | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const trackEventMutation = trpc.reservations.trackEvent.useMutation();
  const createReservationMutation = trpc.reservations.create.useMutation();
  const createBuckpayMutation = trpc.buckpay.createTransaction.useMutation();

  // Rastrear visita à página (dispara uma única vez por sessão)
  useEffect(() => {
    trackEventMutation.mutate({
      eventType: 'page_visit',
      sessionId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleSelectAccommodation = (acc: typeof ACCOMMODATIONS[0]) => {
    setSelectedAccommodation(acc);
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const maskCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const maskPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = maskCPF(e.target.value);
    handleFormChange(e);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = maskPhone(e.target.value);
    handleFormChange(e);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccommodation) return;

    // Rastrear abertura do checkout
    trackEventMutation.mutate({
      eventType: 'checkout_opened',
      sessionId,
    });

    // Salvar reserva
    const externalId = `reserva-${selectedAccommodation.id}-${Date.now()}`;
    
    try {
      await createReservationMutation.mutateAsync({
        externalId,
        accommodationId: selectedAccommodation.id,
        guestName: formData.nome,
        guestEmail: formData.email,
        guestPhone: formData.telefone,
        guestCpf: formData.cpf,
        checkInDate,
        checkOutDate,
        numberOfGuests: 2,
        observations: formData.observacoes,
        bookingFee: 50000,
      });

      // Criar transação BuckPay
      setCheckoutOpen(true);
      setCheckoutStatus('loading');

      const buckpayResponse = await createBuckpayMutation.mutateAsync({
        externalId,
        amount: 50000,
        buyerName: formData.nome,
        buyerEmail: formData.email,
        buyerCpf: formData.cpf,
        buyerPhone: formData.telefone,
      });

      if (buckpayResponse.data) {
        setPixCode(buckpayResponse.data.pix?.code);
        setQrCode(
          buckpayResponse.data.pix?.qrcode_base64
            ? `data:image/png;base64,${buckpayResponse.data.pix.qrcode_base64}`
            : null
        );
        setCheckoutStatus('success');
        
        // Rastrear pagamento confirmado
        trackEventMutation.mutate({
          eventType: 'payment_confirmed',
          sessionId,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setCheckoutOpen(true);
      setCheckoutStatus('error');
    }
  };

  const nightsCount = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
  const totalPrice = selectedAccommodation ? (selectedAccommodation.price * nightsCount) : 0;

  return (
    <div style={{ background: 'var(--reservas-bg)', minHeight: '100vh', fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <header className="reservas-header">
        <div className="logo-container">
          <img
            src="https://cdn.prod.niaracdn1.com.br/uploads/us-east-1:e64e1b2a-2006-45df-b468-3e9d3ff57f85/attachments/ca02cee35ca5406882cd5f0b50f5fa3e_logo-resort-saojoao.png"
            alt="Resort Fazenda São João"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/" style={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px' }}>
            ← Voltar ao site
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="reservas-hero">
        <img
          src="https://cdn.prod.niaracdn1.com.br/uploads/us-east-1:e64e1b2a-2006-45df-b468-3e9d3ff57f85/attachments/bf969fcbb3144cba9b028e9d8e239ac6_bg-resort-fazenda.jpg"
          alt="Resort"
          className="reservas-hero-bg"
        />
      </section>

      {/* Steps */}
      <div className="steps-container">
        <div className="steps-indicator">
          {[1, 2, 3].map((step) => (
            <div key={step} className="step-item" style={{ opacity: step <= currentStep ? 1 : 0.5 }}>
              <div className={`step-number ${step === currentStep ? 'active' : step < currentStep ? 'completed' : ''}`}>
                {step < currentStep ? '✓' : step}
              </div>
              <div className="step-label">
                {step === 1 ? 'Acomodações' : step === 2 ? 'Dados Pessoais' : 'Confirmação'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 20px', marginBottom: '40px' }}>
        {currentStep === 1 && (
          <div className="accommodations-section">
            <h2 className="section-title">Acomodações Disponíveis</h2>
            <div className="accommodations-grid">
              {ACCOMMODATIONS.map((acc) => (
                <div key={acc.id} className="accommodation-card">
                  <img src={acc.image} alt={acc.name} className="accommodation-card-image" />
                  {acc.badge && (
                    <div className="accommodation-card-badge">{acc.badge}</div>
                  )}
                  <div className="accommodation-card-content">
                    <h3>{acc.name}</h3>
                    <p className="description">{acc.description}</p>
                    <div className="accommodation-amenities">
                      {acc.amenities.map((amenity, idx) => (
                        <span key={idx} className="amenity-badge">✓ {amenity}</span>
                      ))}
                    </div>
                    <div className="accommodation-card-footer">
                      <div className="price-section">
                        <div className="price-label">A partir de</div>
                        <div className="price-value">R$ {(acc.price / 100).toFixed(2)}</div>
                      </div>
                      <button
                        className="btn-select"
                        onClick={() => handleSelectAccommodation(acc)}
                      >
                        Selecionar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep === 2 && selectedAccommodation && (
          <div className="guest-form-section">
            <div className="form-container">
              <h2 className="form-title">Dados do Hóspede Principal</h2>
              <form onSubmit={handleSubmitForm}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nome completo <span className="required">*</span></label>
                    <input
                      type="text"
                      name="nome"
                      value={formData.nome}
                      onChange={handleFormChange}
                      placeholder="Seu nome completo"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>CPF <span className="required">*</span></label>
                    <input
                      type="text"
                      name="cpf"
                      value={formData.cpf}
                      onChange={handleCPFChange}
                      placeholder="000.000.000-00"
                      maxLength={14}
                    />
                  </div>
                  <div className="form-group">
                    <label>E-mail <span className="required">*</span></label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Telefone <span className="required">*</span></label>
                    <input
                      type="tel"
                      name="telefone"
                      value={formData.telefone}
                      onChange={handlePhoneChange}
                      placeholder="(19) 99999-0000"
                      maxLength={15}
                    />
                  </div>
                  <div className="form-group">
                    <label>Data de nascimento</label>
                    <input
                      type="date"
                      name="dataNascimento"
                      value={formData.dataNascimento}
                      onChange={handleFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>CEP</label>
                    <input
                      type="text"
                      name="cep"
                      value={formData.cep}
                      onChange={handleFormChange}
                      placeholder="00000-000"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Observações</label>
                  <textarea
                    name="observacoes"
                    value={formData.observacoes}
                    onChange={handleFormChange}
                    placeholder="Alguma observação sobre sua reserva..."
                  />
                </div>
                <button
                  type="submit"
                  className="btn-finish"
                  style={{ marginTop: '20px' }}
                  disabled={createReservationMutation.isPending}
                >
                  {createReservationMutation.isPending ? 'Processando...' : 'Finalizar Reserva'}
                </button>
              </form>
            </div>

            {/* Summary */}
            <div className="summary-sidebar" style={{ marginTop: '20px' }}>
              <h3 className="summary-title">Resumo da Reserva</h3>
              <div className="summary-item">
                <span className="label">Acomodação</span>
                <span className="value">{selectedAccommodation.name}</span>
              </div>
              <div className="summary-item">
                <span className="label">Check-in</span>
                <span className="value">{checkInDate.toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="summary-item">
                <span className="label">Check-out</span>
                <span className="value">{checkOutDate.toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="summary-item">
                <span className="label">Noites</span>
                <span className="value">{nightsCount}</span>
              </div>
              <div className="summary-item">
                <span className="label">Hóspedes</span>
                <span className="value">2</span>
              </div>
              <hr className="summary-divider" />
              <div className="summary-item">
                <span className="label">Diária</span>
                <span className="value">R$ {(selectedAccommodation.price / 100).toFixed(2)}</span>
              </div>
              <div className="summary-item">
                <span className="label">Taxas</span>
                <span className="value">Inclusas</span>
              </div>
              <hr className="summary-divider" />
              <div className="summary-total">
                <span>Total</span>
                <span>R$ {(totalPrice / 100).toFixed(2)}</span>
              </div>
              <div className="summary-item" style={{ color: 'var(--reservas-teal)', fontWeight: 700 }}>
                <span className="label">Taxa de Agendamento</span>
                <span className="value">R$ 500,00</span>
              </div>
              <p style={{ fontSize: '11px', color: '#777', marginTop: '5px', lineHeight: 1.3 }}>
                * A taxa de agendamento será descontada do valor total no check-in. Reembolsável integralmente em até 7 dias em caso de desistência.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="checkout-overlay active">
          <div className="checkout-modal">
            <div className="checkout-header">
              <h2>Confirmar Agendamento</h2>
              <button
                className="checkout-close-btn"
                onClick={() => setCheckoutOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="checkout-body">
              <p className="checkout-subtitle">
                Uma taxa de agendamento de R$ 500,00 que será descontada no valor final da reserva. Caso haja desistência em até 7 dias, o valor será reembolsado integralmente.
              </p>

              <div className="checkout-summary">
                <div className="checkout-summary-item">
                  <span>{selectedAccommodation?.name}</span>
                </div>
                <div className="checkout-summary-item">
                  <span>{checkInDate.toLocaleDateString('pt-BR')} → {checkOutDate.toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="checkout-summary-item checkout-amount-highlight">
                  <span>Taxa de Agendamento: <strong>R$ 500,00</strong></span>
                </div>
              </div>

              <div className="checkout-payment-area">
                {checkoutStatus === 'loading' && (
                  <div className="checkout-status loading">
                    ⏳ Gerando cobrança PIX...
                  </div>
                )}
                {checkoutStatus === 'error' && (
                  <>
                    <div className="checkout-status error">
                      ⚠️ Não foi possível conectar ao servidor de pagamento. Verifique sua conexão e tente novamente.
                    </div>
                    <button className="btn-retry-checkout" onClick={() => setCheckoutStatus(null)}>
                      Tentar novamente
                    </button>
                  </>
                )}
                {checkoutStatus === 'success' && qrCode && (
                  <div className="checkout-pix-display">
                    <img src={qrCode} alt="QR Code PIX" className="checkout-pix-qrcode" />
                    <p className="checkout-pix-copy">Copie o código PIX abaixo:</p>
                    {pixCode && (
                      <div className="checkout-pix-code">{pixCode}</div>
                    )}
                  </div>
                )}
                {checkoutStatus === 'success' && (
                  <button className="btn-close-checkout" onClick={() => setCheckoutOpen(false)}>
                    Concluído
                  </button>
                )}
              </div>

              <p style={{ fontSize: '12px', color: '#777', textAlign: 'center', marginTop: '16px' }}>
                Após o pagamento, sua reserva será confirmada automaticamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
