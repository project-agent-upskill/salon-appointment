import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClientApp, StaffApp } from './App';

const tokenMatch = window.location.pathname.match(/^\/offer\/([^/]+)\/?$/);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{tokenMatch ? <ClientApp token={tokenMatch[1]} /> : <StaffApp />}</React.StrictMode>);
