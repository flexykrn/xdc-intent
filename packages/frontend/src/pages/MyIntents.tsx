import { Link } from 'react-router-dom'
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

function MyIntents() {
  // Mock data - would come from blockchain
  const intents = [
    {
      id: '0x123...abc',
      token: 'XDC',
      amount: '100',
      status: 'active',
      createdAt: '2024-01-15 10:30',
      expiry: '2024-01-15 11:30',
    },
    {
      id: '0x456...def',
      token: 'USDC',
      amount: '50',
      status: 'fulfilled',
      createdAt: '2024-01-15 09:00',
      expiry: '2024-01-15 10:00',
    },
    {
      id: '0x789...ghi',
      token: 'BTC',
      amount: '0.5',
      status: 'expired',
      createdAt: '2024-01-15 08:00',
      expiry: '2024-01-15 09:00',
    },
  ]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Clock className="w-5 h-5 text-blue-500" />
      case 'fulfilled':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'expired':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="badge-info">Active</span>
      case 'fulfilled':
        return <span className="badge-success">Fulfilled</span>
      case 'expired':
        return <span className="badge-error">Expired</span>
      default:
        return <span className="badge">Unknown</span>
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">My Intents</h1>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Created</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Expiry</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {intents.map((intent) => (
              <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm font-mono">{intent.id}</td>
                <td className="py-3 px-4 text-sm">{intent.token}</td>
                <td className="py-3 px-4 text-sm">{intent.amount}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(intent.status)}
                    {getStatusBadge(intent.status)}
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-500">{intent.createdAt}</td>
                <td className="py-3 px-4 text-sm text-gray-500">{intent.expiry}</td>
                <td className="py-3 px-4">
                  <Link
                    to={`/intent/${intent.id}`}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MyIntents