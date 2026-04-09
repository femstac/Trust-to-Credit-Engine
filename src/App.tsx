/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc,
  Timestamp,
  getDoc,
  updateDoc,
  limit
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getNudgeAdvice } from './lib/gemini';
import { 
  LayoutDashboard, 
  History, 
  Target, 
  MessageSquare, 
  TrendingUp, 
  Wallet, 
  ShieldCheck, 
  LogOut,
  ChevronRight,
  Plus,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format } from 'date-fns';
import { cn } from './lib/utils';

// UI Components
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ScrollArea } from './components/ui/scroll-area';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from './components/ui/avatar';

// Types
interface Transaction {
  id: string;
  uid: string;
  type: 'deposit' | 'withdrawal' | 'transfer' | 'payment';
  amount: number;
  timestamp: string;
  counterparty: string;
  status: string;
}

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  trustScore: number;
  scoreReason: string;
  lastAnalyzed: string;
  walletBalance: number;
  currency: string;
}

interface Nudge {
  id: string;
  message: string;
  type: 'savings' | 'education' | 'alert';
  timestamp: string;
  isRead: boolean;
}

interface SavingsGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category: string;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setTransactions([]);
        setNudges([]);
        setGoals([]);
        setIsLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        // Initialize profile if not exists
        const initialProfile: UserProfile = {
          uid: user.uid,
          displayName: user.displayName || 'User',
          email: user.email || '',
          trustScore: 0,
          scoreReason: 'Connect your mobile money data to generate your first Trust Score.',
          lastAnalyzed: new Date().toISOString(),
          walletBalance: 0,
          currency: 'GHS'
        };
        setDoc(userRef, initialProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
      }
      setIsLoading(false);
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`));

    const transQuery = query(collection(db, 'users', user.uid, 'transactions'), orderBy('timestamp', 'desc'), limit(50));
    const unsubTrans = onSnapshot(transQuery, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, `users/${user.uid}/transactions`));

    const nudgeQuery = query(collection(db, 'users', user.uid, 'nudges'), orderBy('timestamp', 'desc'), limit(10));
    const unsubNudges = onSnapshot(nudgeQuery, (snap) => {
      setNudges(snap.docs.map(d => ({ id: d.id, ...d.data() } as Nudge)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, `users/${user.uid}/nudges`));

    const goalQuery = collection(db, 'users', user.uid, 'goals');
    const unsubGoals = onSnapshot(goalQuery, (snap) => {
      setGoals(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavingsGoal)));
    }, (e) => handleFirestoreError(e, OperationType.LIST, `users/${user.uid}/goals`));

    return () => {
      unsubProfile();
      unsubTrans();
      unsubNudges();
      unsubGoals();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const analyzeData = async () => {
    if (!user) return;
    setIsAnalyzing(true);

    try {
      // 1. Generate Synthetic Data
      const genRes = await fetch(`/api/generate-synthetic-data?userId=${user.uid}`);
      const { transactions: newTrans, initialBalance, currency } = await genRes.json();

      // 2. Calculate Score
      const scoreRes = await fetch('/api/calculate-trust-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: newTrans })
      });
      const { score, reason } = await scoreRes.json();

      // 3. Save to Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        trustScore: score,
        scoreReason: reason,
        lastAnalyzed: new Date().toISOString(),
        walletBalance: initialBalance,
        currency
      });

      // Batch add transactions (simplified for prototype)
      for (const t of newTrans.slice(0, 20)) {
        await addDoc(collection(db, 'users', user.uid, 'transactions'), t);
      }

      // 4. Generate AI Nudge
      const nudgeText = await getNudgeAdvice({ ...profile, trustScore: score }, newTrans);
      await addDoc(collection(db, 'users', user.uid, 'nudges'), {
        uid: user.uid,
        message: nudgeText,
        type: 'savings',
        timestamp: new Date().toISOString(),
        isRead: false
      });

    } catch (error) {
      console.error("Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground mb-4 shadow-xl">
              <ShieldCheck className="w-10 h-10" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-foreground font-heading">Trust-to-Credit</h1>
            <p className="text-foreground/70 italic font-serif text-lg">Bridging the informal economy to formal finance.</p>
          </div>
          
          <Card className="border-primary/20 border shadow-2xl bg-white/50 backdrop-blur-sm rounded-[2rem]">
            <CardHeader>
              <CardTitle className="text-2xl font-heading">Welcome to the Buildathon Prototype</CardTitle>
              <CardDescription className="text-muted-foreground">
                Turn your mobile money history into a verifiable Trust Score and unlock credit opportunities.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button onClick={handleLogin} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-14 text-lg font-medium rounded-full shadow-lg transition-all hover:scale-[1.02]">
                Login with Google
              </Button>
            </CardFooter>
          </Card>

          <div className="grid grid-cols-3 gap-4 text-[10px] font-mono uppercase tracking-widest opacity-40">
            <div>Consistency</div>
            <div>Velocity</div>
            <div>Resilience</div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans pb-12">
        {/* Header */}
        <header className="border-b border-primary/10 p-4 flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-50">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-heading font-bold tracking-tight text-xl">TRUST ENGINE</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold uppercase tracking-tighter">{user.displayName}</span>
              <span className="text-[10px] opacity-50 font-mono">{profile?.currency} Wallet Active</span>
            </div>
            <Avatar className="border-2 border-primary/20 w-10 h-10 shadow-sm">
              <AvatarImage src={user.photoURL || ''} />
              <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">{user.displayName?.[0]}</AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="hover:bg-primary/10 rounded-full">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
          {/* Hero Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Trust Score Card */}
            <Card className="lg:col-span-2 border-primary/10 border shadow-xl bg-white rounded-[2.5rem] overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                <ShieldCheck className="w-64 h-64" />
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-3xl font-heading italic">Your Trust Score</CardTitle>
                    <CardDescription className="font-mono text-[10px] uppercase tracking-wider">Risk-Adjusted Behavioral Rating</CardDescription>
                  </div>
                  <Badge variant="outline" className="border-primary/20 font-mono bg-secondary/50 rounded-full px-3">
                    LVL {Math.floor((profile?.trustScore || 0) / 20) + 1}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center gap-8 pt-4">
                <div className="relative w-56 h-56 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Score', value: profile?.trustScore || 0 },
                          { name: 'Remaining', value: 100 - (profile?.trustScore || 0) }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={90}
                        startAngle={210}
                        endAngle={-30}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="var(--color-primary)" />
                        <Cell fill="var(--color-secondary)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
                    <span className="text-6xl font-bold tracking-tighter text-primary font-heading">
                      {profile?.trustScore || 0}
                    </span>
                    <span className="text-[10px] font-mono uppercase opacity-40">of 100</span>
                  </div>
                </div>
                <div className="flex-1 space-y-6">
                  <div className="p-6 bg-secondary/30 border-l-4 border-primary rounded-2xl shadow-inner">
                    <p className="text-lg leading-relaxed italic font-serif text-foreground/80">
                      "{profile?.scoreReason}"
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      onClick={analyzeData} 
                      disabled={isAnalyzing}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-6 h-12 shadow-md transition-all hover:scale-105"
                    >
                      {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                      Recalculate Score
                    </Button>
                    <Button variant="outline" className="border-primary/20 rounded-full px-6 h-12 hover:bg-secondary">
                      View Report
                    </Button>
                  </div>
                </div>
              </CardContent>
              <div className="border-t border-primary/5 grid grid-cols-3 divide-x divide-primary/5 bg-secondary/10">
                <div className="p-6 text-center">
                  <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Consistency</div>
                  <div className="font-heading text-xl font-bold text-primary">High</div>
                </div>
                <div className="p-6 text-center">
                  <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Velocity</div>
                  <div className="font-heading text-xl font-bold text-primary">Moderate</div>
                </div>
                <div className="p-6 text-center">
                  <div className="text-[10px] font-mono uppercase opacity-40 mb-1">Resilience</div>
                  <div className="font-heading text-xl font-bold text-primary">Low</div>
                </div>
              </div>
            </Card>

            {/* Wallet Quick View */}
            <Card className="border-primary/10 border shadow-xl bg-primary text-primary-foreground rounded-[2.5rem] overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xl font-heading flex items-center gap-2">
                  <Wallet className="w-6 h-6" />
                  Wallet Balance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-1">
                  <span className="text-5xl font-bold tracking-tighter font-heading">
                    {profile?.currency} {profile?.walletBalance.toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2 text-xs opacity-70">
                    <TrendingUp className="w-3 h-3 text-green-300" />
                    <span>+12.5% from last month</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest opacity-70">
                    <span>Savings Progress</span>
                    <span>65%</span>
                  </div>
                  <Progress value={65} className="h-2.5 bg-white/20" />
                </div>

                <div className="pt-4 space-y-3">
                  <Button className="w-full bg-white text-primary hover:bg-white/90 rounded-full h-12 font-bold shadow-lg">
                    Withdraw Funds
                  </Button>
                  <Button variant="ghost" className="w-full text-white hover:bg-white/10 rounded-full h-12">
                    Transfer to Goal
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="activity" className="space-y-8">
            <TabsList className="bg-secondary/30 border border-primary/5 w-full md:w-auto justify-start rounded-full h-14 p-1.5 gap-2 backdrop-blur-sm">
              <TabsTrigger 
                value="activity" 
                className="rounded-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md px-6 h-full text-xs font-bold uppercase tracking-widest transition-all"
              >
                <History className="w-4 h-4 mr-2" />
                Activity
              </TabsTrigger>
              <TabsTrigger 
                value="nudges" 
                className="rounded-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md px-6 h-full text-xs font-bold uppercase tracking-widest transition-all"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Nudges
                {nudges.some(n => !n.isRead) && (
                  <span className="ml-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="goals" 
                className="rounded-full data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-md px-6 h-full text-xs font-bold uppercase tracking-widest transition-all"
              >
                <Target className="w-4 h-4 mr-2" />
                Goals
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="space-y-4">
              <Card className="border-primary/10 border shadow-xl bg-white rounded-[2rem] overflow-hidden">
                <ScrollArea className="h-[500px]">
                  <div className="divide-y divide-primary/5">
                    {transactions.length === 0 ? (
                      <div className="p-20 text-center space-y-4">
                        <AlertCircle className="w-16 h-16 mx-auto opacity-10 text-primary" />
                        <p className="opacity-50 font-serif italic text-lg">No transactions found. Click "Recalculate Score" to ingest your mobile money logs.</p>
                      </div>
                    ) : (
                      transactions.map((t) => (
                        <div key={t.id} className="p-6 flex items-center justify-between hover:bg-secondary/20 transition-all cursor-pointer group">
                          <div className="flex items-center gap-5">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center border border-primary/5 shadow-sm transition-transform group-hover:scale-110",
                              t.type === 'deposit' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                            )}>
                              {t.type === 'deposit' ? <TrendingUp className="w-6 h-6" /> : <Wallet className="w-6 h-6" />}
                            </div>
                            <div>
                              <div className="font-bold text-base font-heading">{t.counterparty}</div>
                              <div className="text-[10px] font-mono uppercase opacity-40 tracking-wider">
                                {format(new Date(t.timestamp), 'MMM dd, yyyy • HH:mm')}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn(
                              "font-bold font-mono text-lg",
                              t.type === 'deposit' ? "text-green-700" : "text-red-700"
                            )}>
                              {t.type === 'deposit' ? '+' : '-'}{profile?.currency} {t.amount.toLocaleString()}
                            </div>
                            <div className="text-[10px] uppercase tracking-widest opacity-30 group-hover:opacity-100 transition-opacity">
                              {t.type}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </TabsContent>

            <TabsContent value="nudges" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {nudges.map((n) => (
                  <motion.div 
                    key={n.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className="border-primary/10 border shadow-lg bg-white h-full rounded-[2rem] overflow-hidden hover:shadow-2xl transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="bg-primary/10 text-primary uppercase text-[10px] tracking-widest px-3 rounded-full">
                            {n.type} Nudge
                          </Badge>
                          <span className="text-[10px] font-mono opacity-40">
                            {format(new Date(n.timestamp), 'MMM dd')}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <p className="font-serif italic text-2xl leading-snug text-foreground/90">"{n.message}"</p>
                      </CardContent>
                      <CardFooter className="pt-4">
                        <Button variant="link" className="p-0 text-primary font-bold uppercase text-[10px] tracking-widest hover:no-underline group">
                          Take Action <ChevronRight className="w-3 h-3 ml-1 transition-transform group-hover:translate-x-1" />
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
                {nudges.length === 0 && (
                  <div className="col-span-full p-20 text-center opacity-30 font-serif italic text-xl">
                    Your AI assistant is analyzing your patterns. Check back soon for personalized advice.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="goals" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {goals.map((g) => (
                  <Card key={g.id} className="border-border border shadow-sm bg-card rounded-3xl hover:shadow-md transition-shadow group">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl font-heading italic">{g.title}</CardTitle>
                        <Badge variant="outline" className="border-primary/20 text-primary rounded-full px-3 text-[10px] uppercase tracking-widest bg-primary/5">{g.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase tracking-widest opacity-50 font-sans">Current</span>
                          <span className="text-2xl font-bold font-heading text-primary">{profile?.currency} {g.currentAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] uppercase tracking-widest opacity-50 font-sans">Target</span>
                          <span className="text-lg opacity-60 font-heading">{profile?.currency} {g.targetAmount.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-sans uppercase tracking-widest opacity-60">
                          <span>Progress</span>
                          <span>{Math.round((g.currentAmount / g.targetAmount) * 100)}%</span>
                        </div>
                        <Progress value={(g.currentAmount / g.targetAmount) * 100} className="h-3 bg-secondary rounded-full" />
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-2xl h-12 font-bold uppercase tracking-widest text-xs transition-all shadow-sm hover:shadow-md">
                        Add Savings
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
                <Card className="border-border border-2 border-dashed shadow-none bg-transparent flex flex-col items-center justify-center p-12 cursor-pointer hover:bg-primary/5 transition-all rounded-3xl group">
                  <div className="w-16 h-16 rounded-full border-2 border-border flex items-center justify-center mb-4 transition-transform group-hover:scale-110 group-hover:border-primary">
                    <Plus className="w-8 h-8 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <span className="font-bold uppercase tracking-widest text-xs text-muted-foreground group-hover:text-primary">New Savings Goal</span>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer Info */}
        <footer className="max-w-7xl mx-auto px-4 mt-20 pb-12">
          <div className="pt-8 border-t border-primary/10 flex flex-col md:flex-row justify-between items-center gap-6 opacity-40 text-[10px] font-mono uppercase tracking-widest">
            <div>© 2026 West Africa Buildathon • Trust-to-Credit Engine</div>
            <div className="flex gap-10">
              <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-primary transition-colors">Regulatory Sandbox</a>
              <a href="#" className="hover:text-primary transition-colors">API Docs</a>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
