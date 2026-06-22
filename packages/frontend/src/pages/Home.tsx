import { Link } from 'react-router-dom'
import { Wallet, Zap, Shield, BarChart3 } from 'lucide-react'

function Home() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          XDC Intent Framework
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          The most advanced intent-based trading protocol on XDC Network.
          Create intents, let solvers compete, get the best prices.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/create" className="btn-primary text-lg px-8 py-3">
            Create Intent
          </Link>
          <Link to="/explorer" className="btn-secondary text-lg px-8 py-3">
            Explore Intents
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard icon={<Zap className="w-8 h-8" />} label="Total Intents" value="1,234" />
        <StatCard icon={<Wallet className="w-8 h-8" />} label="Volume (TXDC)" value="50.2K" />
        <StatCard icon={<Shield className="w-8 h-8" />} label="Active Solvers" value="12" />
        <StatCard icon={<BarChart3 className="w-8 h-8" />} label="Avg Savings" value="0.4%" />
      </section>

      {/* Features Section */}
      <section className="py-12">
        <h2 className="text-3xl font-bold text-center mb-12">Why Intent-Based Trading?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            title="Better Prices"
            description="Solvers compete to give you the best rates. No more settling for AMM prices."
          />
          <FeatureCard
            title="MEV Protection"
            description="Your trades are protected from frontrunning and sandwich attacks."
          />
          <FeatureCard
            title="Gasless Trading"
            description="Solvers pay gas fees. You just sign and go."
          />
        </div>
      </section>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card text-center">
      <div className="text-primary-600 mb-4 flex justify-center">{icon}</div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card">
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

export default Home