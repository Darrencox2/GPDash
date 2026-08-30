'use client';
// Mounted once in the root layout. Installs the window-level error and
// unhandled-rejection listeners; renders nothing.
import { useEffect } from 'react';
import { installGlobalErrorReporting } from '@/lib/report-error';

export default function ErrorReporter() {
  useEffect(() => { installGlobalErrorReporting(); }, []);
  return null;
}
