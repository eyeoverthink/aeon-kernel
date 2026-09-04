import { type ReactNode } from 'react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Layout } from '@/components/layout';

import Workbench from '@/pages/workbench';
import Transmuter from '@/pages/transmuter';
import Ledger from '@/pages/ledger';
import About from '@/pages/about';
import MatterLab from '@/pages/matter-lab';
import FighterCards from '@/pages/fighter-cards';
import PeriodicTable from '@/pages/periodic-table';
import FusionLab from '@/pages/fusion-lab';
import CveFeed from '@/pages/cve-feed';
import X86Map from '@/pages/x86-map';
import ExecutionKinematics from '@/pages/execution-kinematics';
import HdcTransmutation from '@/pages/hdc-transmutation';

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Workbench} />
          <Route path="/transmuter" component={Transmuter} />
          <Route path="/receipts" component={Ledger} />
          <Route path="/about" component={About} />
          <Route path="/matter-lab" component={MatterLab} />
          <Route path="/fighter-cards" component={FighterCards} />
          <Route path="/periodic-table" component={PeriodicTable} />
          <Route path="/fusion-lab" component={FusionLab} />
          <Route path="/cve-feed" component={CveFeed} />
          <Route path="/x86-map" component={X86Map} />
          <Route path="/kinematics" component={ExecutionKinematics} />
          <Route path="/hdc" component={HdcTransmutation} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
