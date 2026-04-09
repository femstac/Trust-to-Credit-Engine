import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: any;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "Something went wrong.";
      if (error && error.message) {
        try {
          const parsed = JSON.parse(error.message);
          if (parsed.error) {
            errorMessage = `Firebase Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`;
          }
        } catch (e) {
          errorMessage = error.message;
        }
      }

      return (
        <div className="p-8 text-center bg-red-50 border border-red-200 rounded-lg m-4">
          <h2 className="text-xl font-bold text-red-700 mb-2 font-heading">System Error</h2>
          <p className="text-red-600 mb-4 font-sans">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-sans"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// Validation test for Firestore connection
import { getDocFromServer, doc as firestoreDoc } from 'firebase/firestore';
import { db } from '../firebase';

async function testConnection() {
  try {
    await getDocFromServer(firestoreDoc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
