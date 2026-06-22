import { Link } from 'react-router-dom'
import { Search, Filter, ArrowUpDown } from 'lucide-react'
import { useState } from 'react'

function Explorer() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Mock data - would come from blockchain
  const intents = [
    {
      id: '0x123...abc',
      creator: '0xabc...def',
      token: 'XDC',
      amount: '100',
      status: 'active',
      createdAt: '2024-01-15 10:30',
    },
    {
      id: '0x456...def',
      creator: '0xghi...jkl',
      token: 'USDC',
      amount: '50',
      status: 'fulfilled',
      createdAt: '2024-01-15 09:00',
    },
    {
      id: '0x789...ghi',
      creator: '0xmno...pqr',
      token: 'BTC',
      amount: '0.5',
      status: 'expired',
      createdAt: '2024-01-15 08:00',
    },
    {
      id: '0xabc...jkl',
      creator: '0xstu...vwx',
      token: 'ETH',
      amount: '2',
      status: 'active',
      createdAt: '2024-01-15 07:00',
    },
  ]

  const filteredIntents = intents.filter((intent) => {
    const matchesSearch = intent.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      intent.token.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || intent.status === statusFilter
    return matchesSearch && matchesStatus
  })

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
      <h1 className="text-3xl font-bold mb-8">Intent Explorer</h1>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by ID or token..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <div className="text-2xl font-bold text-gray-900">{intents.length}</div>
          <div className="text-sm text-gray-500">Total Intents</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-blue-600">
            {intents.filter((i) => i.status === 'active').length}
          </div>
          <div className="text-sm text-gray-500">Active</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-green-600">
            {intents.filter((i) => i.status === 'fulfilled').length}
          </div>
          <div className="text-sm text-gray-500">Fulfilled</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-600">
            {intents.filter((i) => i.status === 'expired').length}
          </div>
          <div className="text-sm text-gray-500">Expired</div>
        </div>
      </div>

      {/* Intents Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                <div className="flex items-center gap-1">
                  ID
                  <ArrowUpDown className="w-4 h-4" />
                </div>
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Creator</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Token</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Created</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIntents.map((intent) => (
              <tr key={intent.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm font-mono">{intent.id}</td>
                <td className="py-3 px-4 text-sm font-mono">{intent.creator}</td>
                <td className="py-3 px-4 text-sm">{intent.token}</td>
                <td className="py-3 px-4 text-sm">{intent.amount}</td>
                <td className="py-3 px-4">{getStatusBadge(intent.status)}</td>
                <td className="py-3 px-4 text-sm text-gray-500">{intent.createdAt}</td>
                <td className="py-3 px-4">
                  <Link
                    to={`/intent/${intent.id}`}
                    className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                  >
                    View
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

export default Explorer
