import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { FormEvent, useState } from "react";

function AdminLogin() {
  const { login, loginPending, loginError } = useAuth();
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await login(password);
    } catch {
      // erro já exposto via loginError
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col items-center gap-6 p-8 max-w-md w-full"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          Painel Administrativo
        </h1>
        <Input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full"
          autoFocus
        />
        {loginError && (
          <p className="text-sm text-red-600">{loginError.message}</p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loginPending}>
          {loginPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const funnelMetricsQuery = trpc.reservations.getFunnelMetrics.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const reservationsQuery = trpc.reservations.list.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const deleteReservationMutation = trpc.reservations.delete.useMutation({
    onSuccess: () => {
      reservationsQuery.refetch();
      funnelMetricsQuery.refetch();
    },
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (externalId: string, guestName: string) => {
    if (!window.confirm(`Excluir a reserva de ${guestName}? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setDeletingId(externalId);
    try {
      await deleteReservationMutation.mutateAsync({ externalId });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div>Carregando...</div>;
  }

  if (!user || user.role !== "admin") {
    return <AdminLogin />;
  }

  const metrics = funnelMetricsQuery.data || [];
  const pageVisits = metrics.find((m) => m.event_type === "page_visit")?.count || 0;
  const checkoutOpened = metrics.find((m) => m.event_type === "checkout_opened")?.count || 0;
  const paymentConfirmed = metrics.find((m) => m.event_type === "payment_confirmed")?.count || 0;
  const allReservations = reservationsQuery.data || [];

  // Filtrar reservas
  const filteredReservations = allReservations.filter((res) => {
    const matchesSearch =
      res.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.guestEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      res.guestPhone?.includes(searchTerm);
    const matchesStatus = !statusFilter || res.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const conversionRate1 = pageVisits > 0 ? ((checkoutOpened / pageVisits) * 100).toFixed(1) : 0;
  const conversionRate2 = checkoutOpened > 0 ? ((paymentConfirmed / checkoutOpened) * 100).toFixed(1) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Painel Administrativo</h1>
          <p className="text-gray-600 mt-2">Resort Fazenda São João - Sistema de Reservas</p>
        </div>

        {/* Métricas de Funil */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Métricas de Funil de Conversão</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="text-sm text-gray-600 mb-2">Visitas à Página</div>
              <div className="text-3xl font-bold text-blue-600">{pageVisits}</div>
              <div className="text-xs text-gray-500 mt-2">Usuários que acessaram</div>
            </Card>

            <Card className="p-6">
              <div className="text-sm text-gray-600 mb-2">Checkouts Abertos</div>
              <div className="text-3xl font-bold text-green-600">{checkoutOpened}</div>
              <div className="text-xs text-gray-500 mt-2">Conversão: {conversionRate1}%</div>
            </Card>

            <Card className="p-6">
              <div className="text-sm text-gray-600 mb-2">Pagamentos Confirmados</div>
              <div className="text-3xl font-bold text-purple-600">{paymentConfirmed}</div>
              <div className="text-xs text-gray-500 mt-2">Conversão: {conversionRate2}%</div>
            </Card>

            <Card className="p-6">
              <div className="text-sm text-gray-600 mb-2">Taxa de Conversão Total</div>
              <div className="text-3xl font-bold text-orange-600">
                {pageVisits > 0 ? ((paymentConfirmed / pageVisits) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-xs text-gray-500 mt-2">Visitas → Pagamentos</div>
            </Card>
          </div>
        </div>

        {/* Listagem de Reservas */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Reservas Recentes</h2>
          
          {/* Filtros */}
          <div className="mb-4 flex gap-4">
            <Input
              placeholder="Buscar por nome, e-mail ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select value={statusFilter || ""} onValueChange={(val) => setStatusFilter(val || null)}>
              <option value="">Todos os Status</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmada</option>
              <option value="cancelled">Cancelada</option>
              <option value="completed">Concluída</option>
            </Select>
          </div>

          <Card className="overflow-hidden">
            {filteredReservations.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                {allReservations.length === 0 ? "Nenhuma reserva encontrada" : "Nenhuma reserva corresponde aos filtros"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Hóspede</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">E-mail</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Telefone</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Check-in</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Check-out</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Taxa</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredReservations.map((reservation) => (
                      <tr key={reservation.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">{reservation.guestName}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{reservation.guestEmail}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{reservation.guestPhone || "-"}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(reservation.checkInDate).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {new Date(reservation.checkOutDate).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              reservation.status === "confirmed"
                                ? "bg-green-100 text-green-800"
                                : reservation.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : reservation.status === "cancelled"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {reservation.status === "confirmed"
                              ? "Confirmada"
                              : reservation.status === "pending"
                                ? "Pendente"
                                : reservation.status === "cancelled"
                                  ? "Cancelada"
                                  : "Concluída"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                          R$ {(reservation.bookingFee / 100).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === reservation.externalId}
                            onClick={() => handleDelete(reservation.externalId, reservation.guestName)}
                          >
                            {deletingId === reservation.externalId ? "Excluindo..." : "Excluir"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
