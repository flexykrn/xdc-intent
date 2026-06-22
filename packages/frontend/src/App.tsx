import { Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import Home from './pages/Home'
import CreateIntent from './pages/CreateIntent'
import MyIntents from './pages/MyIntents'
import IntentDetails from './pages/IntentDetails'
import Explorer from './pages/Explorer'
import SolverDashboard from './pages/SolverDashboard'

function App() {
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateIntent />} />
          <Route path="/my-intents" element={<MyIntents />} />
          <Route path="/intent/:id" element={<IntentDetails />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/solver" element={<SolverDashboard />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </>
  )
}

export default App