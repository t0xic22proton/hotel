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

// Taxa de agendamento por faixa de valor total da reserva (valores em centavos)
function getBookingFee(totalPriceCents: number): number {
  if (totalPriceCents <= 50000) return 28000; // até R$ 500 -> R$ 280
  if (totalPriceCents <= 90000) return 38000; // até R$ 900 -> R$ 380
  return 50000; // acima de R$ 900 -> R$ 500
}

// Diária de cada acomodação é para um casal (2 adultos). Valores adicionais por diária, em centavos.
const EXTRA_ADULT_PRICE = 17000; // R$ 170,00 por adulto extra, por diária
const EXTRA_CHILD_PRICE = 8000; // R$ 80,00 por criança de 8+ anos, por diária
const CHILD_FREE_AGE_LIMIT = 8; // crianças abaixo desta idade não pagam
const INCLUDED_ADULTS = 2;
const SERVICE_FEE_RATE = 0.10; // 10% de taxa de serviço sobre diária + extras

type Guest = { id: string; name: string; birthDate: string };

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function calculateAge(birthDate: string, referenceDate: Date): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = referenceDate.getFullYear() - birth.getFullYear();
  const monthDiff = referenceDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function Reservations() {
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [selectedAccommodation, setSelectedAccommodation] = useState<typeof ACCOMMODATIONS[0] | null>(null);
  
  const [checkInDate, setCheckInDate] = useState<Date | null>(null);
  const [checkOutDate, setCheckOutDate] = useState<Date | null>(null);

  const [numberOfAdults, setNumberOfAdults] = useState(2);
  // Acompanhantes adultos (além do hóspede principal). Quantidade = numberOfAdults - 1.
  const [companions, setCompanions] = useState<Guest[]>([{ id: crypto.randomUUID(), name: '', birthDate: '' }]);
  const [children, setChildren] = useState<Guest[]>([]);

  const handleNumberOfAdultsChange = (value: number) => {
    const adults = Math.max(1, value);
    setNumberOfAdults(adults);
    const companionsNeeded = adults - 1;
    setCompanions(prev => {
      if (companionsNeeded <= prev.length) return prev.slice(0, companionsNeeded);
      const extra = Array.from({ length: companionsNeeded - prev.length }, () => ({
        id: crypto.randomUUID(),
        name: '',
        birthDate: '',
      }));
      return [...prev, ...extra];
    });
  };

  const handleCompanionChange = (id: string, field: 'name' | 'birthDate', value: string) => {
    setCompanions(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const handleAddChild = () => {
    setChildren(prev => [...prev, { id: crypto.randomUUID(), name: '', birthDate: '' }]);
  };

  const handleRemoveChild = (id: string) => {
    setChildren(prev => prev.filter(c => c.id !== id));
  };

  const handleChildChange = (id: string, field: 'name' | 'birthDate', value: string) => {
    setChildren(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)));
  };

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
    if (!checkInDate || !checkOutDate) {
      alert('Selecione as datas de check-in e check-out.');
      return;
    }
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

  const nightsCount = checkInDate && checkOutDate
    ? Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const extraAdultsCount = Math.max(0, numberOfAdults - INCLUDED_ADULTS);
  const payingChildrenCount = children.filter(c => {
    const age = checkInDate ? calculateAge(c.birthDate, checkInDate) : null;
    return age !== null && age >= CHILD_FREE_AGE_LIMIT;
  }).length;
  const freeChildrenCount = children.length - payingChildrenCount;

  const basePrice = selectedAccommodation ? selectedAccommodation.price * nightsCount : 0;
  const extraAdultsPrice = extraAdultsCount * EXTRA_ADULT_PRICE * nightsCount;
  const extraChildrenPrice = payingChildrenCount * EXTRA_CHILD_PRICE * nightsCount;
  const serviceFee = Math.round((basePrice + extraAdultsPrice + extraChildrenPrice) * SERVICE_FEE_RATE);
  const totalPrice = basePrice + extraAdultsPrice + extraChildrenPrice + serviceFee;
  const bookingFee = getBookingFee(totalPrice);

  const totalGuests = numberOfAdults + children.length;

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccommodation || !checkInDate || !checkOutDate) return;

    if (companions.some(c => c.name.trim() === '' || c.birthDate === '')) {
      alert('Informe nome e data de nascimento de todos os acompanhantes.');
      return;
    }
    if (children.some(c => c.name.trim() === '' || c.birthDate === '')) {
      alert('Informe nome e data de nascimento de todas as crianças.');
      return;
    }

    // Rastrear abertura do checkout
    trackEventMutation.mutate({
      eventType: 'checkout_opened',
      sessionId,
    });

    // Salvar reserva
    const externalId = `reserva-${selectedAccommodation.id}-${Date.now()}`;

    const guestsInfo = JSON.stringify([
      { name: formData.nome, birthDate: formData.dataNascimento, isMainGuest: true },
      ...companions.map(c => ({ name: c.name, birthDate: c.birthDate, isMainGuest: false })),
      ...children.map(c => ({ name: c.name, birthDate: c.birthDate, isMainGuest: false })),
    ]);

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
        numberOfGuests: totalGuests,
        guestsInfo,
        observations: formData.observacoes,
        bookingFee,
      });

      // Criar transação BuckPay
      setCheckoutOpen(true);
      setCheckoutStatus('loading');

      const buckpayResponse = await createBuckpayMutation.mutateAsync({
        externalId,
        amount: bookingFee,
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
            <div className="form-grid" style={{ marginBottom: '20px' }}>
              <div className="form-group">
                <label>Check-in <span className="required">*</span></label>
                <input
                  type="date"
                  value={checkInDate ? toDateInputValue(checkInDate) : ''}
                  onChange={(e) => {
                    const newCheckIn = fromDateInputValue(e.target.value);
                    if (!newCheckIn) return;
                    setCheckInDate(newCheckIn);
                    if (checkOutDate && checkOutDate.getTime() <= newCheckIn.getTime()) {
                      setCheckOutDate(new Date(newCheckIn.getTime() + 24 * 60 * 60 * 1000));
                    }
                  }}
                />
              </div>
              <div className="form-group">
                <label>Check-out <span className="required">*</span></label>
                <input
                  type="date"
                  min={checkInDate ? toDateInputValue(new Date(checkInDate.getTime() + 24 * 60 * 60 * 1000)) : undefined}
                  value={checkOutDate ? toDateInputValue(checkOutDate) : ''}
                  onChange={(e) => {
                    const newCheckOut = fromDateInputValue(e.target.value);
                    if (!newCheckOut) return;
                    if (checkInDate && newCheckOut.getTime() <= checkInDate.getTime()) {
                      alert('Check-out deve ser depois do check-in.');
                      return;
                    }
                    setCheckOutDate(newCheckOut);
                  }}
                />
              </div>
            </div>
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
                    <label>Data de nascimento <span className="required">*</span></label>
                    <input
                      type="date"
                      name="dataNascimento"
                      value={formData.dataNascimento}
                      onChange={handleFormChange}
                      required
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

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <h3 style={{ fontSize: '15px', marginBottom: '10px' }}>Hóspedes</h3>
                  <p style={{ fontSize: '12px', color: '#777', marginBottom: '10px' }}>
                    A diária desta acomodação já inclui um casal (2 adultos). Adulto extra: R$ {(EXTRA_ADULT_PRICE / 100).toFixed(2)}/diária. Criança a partir de {CHILD_FREE_AGE_LIMIT} anos: R$ {(EXTRA_CHILD_PRICE / 100).toFixed(2)}/diária. Crianças menores de {CHILD_FREE_AGE_LIMIT} anos não pagam. Informe nome e data de nascimento de todos os hóspedes; o CPF é necessário apenas do hóspede principal.
                  </p>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Número de adultos <span className="required">*</span></label>
                      <input
                        type="number"
                        min={1}
                        value={numberOfAdults}
                        onChange={(e) => handleNumberOfAdultsChange(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {companions.map((companion, idx) => (
                    <div key={companion.id} className="form-grid">
                      <div className="form-group">
                        <label>Nome do acompanhante {idx + 1} <span className="required">*</span></label>
                        <input
                          type="text"
                          value={companion.name}
                          onChange={(e) => handleCompanionChange(companion.id, 'name', e.target.value)}
                          placeholder="Nome completo"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Data de nascimento <span className="required">*</span></label>
                        <input
                          type="date"
                          value={companion.birthDate}
                          onChange={(e) => handleCompanionChange(companion.id, 'birthDate', e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  ))}

                  {children.map((child, idx) => (
                    <div key={child.id} className="form-grid" style={{ alignItems: 'flex-end' }}>
                      <div className="form-group">
                        <label>Nome da criança {idx + 1} <span className="required">*</span></label>
                        <input
                          type="text"
                          value={child.name}
                          onChange={(e) => handleChildChange(child.id, 'name', e.target.value)}
                          placeholder="Nome completo"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Data de nascimento <span className="required">*</span></label>
                        <input
                          type="date"
                          value={child.birthDate}
                          onChange={(e) => handleChildChange(child.id, 'birthDate', e.target.value)}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-select"
                        onClick={() => handleRemoveChild(child.id)}
                        style={{ height: 'fit-content' }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn-select"
                    onClick={handleAddChild}
                    style={{ marginTop: '5px' }}
                  >
                    + Adicionar criança
                  </button>
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
                <span className="value">{checkInDate?.toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="summary-item">
                <span className="label">Check-out</span>
                <span className="value">{checkOutDate?.toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="summary-item">
                <span className="label">Noites</span>
                <span className="value">{nightsCount}</span>
              </div>
              <div className="summary-item">
                <span className="label">Hóspedes</span>
                <span className="value">
                  {totalGuests} ({numberOfAdults} {numberOfAdults === 1 ? 'adulto' : 'adultos'}{children.length > 0 ? `, ${children.length} ${children.length === 1 ? 'criança' : 'crianças'}` : ''})
                </span>
              </div>
              <hr className="summary-divider" />
              <div className="summary-item">
                <span className="label">Diária ({selectedAccommodation.name}, casal)</span>
                <span className="value">R$ {(selectedAccommodation.price / 100).toFixed(2)}</span>
              </div>
              {extraAdultsCount > 0 && (
                <div className="summary-item">
                  <span className="label">Adulto(s) extra ({extraAdultsCount} x {nightsCount} diária(s))</span>
                  <span className="value">R$ {(extraAdultsPrice / 100).toFixed(2)}</span>
                </div>
              )}
              {payingChildrenCount > 0 && (
                <div className="summary-item">
                  <span className="label">Criança(s) {CHILD_FREE_AGE_LIMIT}+ ({payingChildrenCount} x {nightsCount} diária(s))</span>
                  <span className="value">R$ {(extraChildrenPrice / 100).toFixed(2)}</span>
                </div>
              )}
              {freeChildrenCount > 0 && (
                <div className="summary-item">
                  <span className="label">Criança(s) menores de {CHILD_FREE_AGE_LIMIT} anos</span>
                  <span className="value">Grátis</span>
                </div>
              )}
              <div className="summary-item">
                <span className="label">Taxa de serviço (10%)</span>
                <span className="value">R$ {(serviceFee / 100).toFixed(2)}</span>
              </div>
              <hr className="summary-divider" />
              <div className="summary-total">
                <span>Total</span>
                <span>R$ {(totalPrice / 100).toFixed(2)}</span>
              </div>
              <div className="summary-item" style={{ color: 'var(--reservas-teal)', fontWeight: 700 }}>
                <span className="label">Taxa de Agendamento</span>
                <span className="value">R$ {(bookingFee / 100).toFixed(2)}</span>
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
                Uma taxa de agendamento de R$ {(bookingFee / 100).toFixed(2)} que será descontada no valor final da reserva. Caso haja desistência em até 7 dias, o valor será reembolsado integralmente.
              </p>

              <div className="checkout-summary">
                <div className="checkout-summary-item">
                  <span>{selectedAccommodation?.name}</span>
                </div>
                <div className="checkout-summary-item">
                  <span>{checkInDate?.toLocaleDateString('pt-BR')} → {checkOutDate?.toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="checkout-summary-item checkout-amount-highlight">
                  <span>Taxa de Agendamento: <strong>R$ {(bookingFee / 100).toFixed(2)}</strong></span>
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
