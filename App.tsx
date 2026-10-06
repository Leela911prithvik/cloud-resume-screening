/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, FileText, Settings, BarChart2, CheckCircle, CheckCircle2, FileUp, 
  PlayCircle, Loader2, AlertCircle, ChevronDown, ChevronUp, AlertTriangle, 
  MessageSquare, X, Send, Lightbulb, Sparkles, PenLine, FileCheck, Trash2, 
  RefreshCw, Star, Zap, Check, ArrowRight, BookOpen, Layers, Plus, BadgeHelp
} from 'lucide-react';
import Markdown from 'react-markdown';

type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

type Candidate = {
  filename: string;
  score: number;
  skills: string[];
  missingSkills?: string[];
  extraRecommendedSkills?: string[];
  resumeImprovementTips?: string[];
  recommendation?: string;
  preview: string;
  rank: number;
  status: string;
  fullText?: string;
};

const JD_TEMPLATES = {
  "Data Scientist": "We are looking for a Data Scientist with strong Python, SQL, and Machine Learning skills. Must have experience with Scikit-learn, Pandas, and Neural Networks.",
  "Frontend Developer": "Seeking a Frontend Developer proficient in HTML, CSS, JavaScript, and React. Experience with Tailwind CSS and TypeScript is highly preferred.",
  "Clear": ""
};

export default function App() {
  const [jobDescription, setJobDescription] = useState('');
  const [jdMode, setJdMode] = useState<'write' | 'upload'>('write');
  const [isJdParsing, setIsJdParsing] = useState(false);
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  const [isJdDragging, setIsJdDragging] = useState(false);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [rebuildData, setRebuildData] = useState<Record<number, { loading: boolean; text: string }>>({});

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', text: "Hi! I'm your AI Career Coach. Need help preparing for an interview or improving your resume? Just ask!" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isChatOpen) {
      scrollToBottom();
    }
  }, [chatMessages, isChatOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userText = chatInput.trim();
    const newMessages = [...chatMessages, { role: 'user' as const, text: userText }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const contextData = {
        jobDescription: jobDescription,
        // @ts-ignore
        resumeText: results && results.length > 0 ? (results[0] as any).fullText : ''
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, contextData })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }
      
      const data = await response.json();
      setChatMessages([...newMessages, { role: 'model', text: data.reply || "I am ready to help with any questions!" }]);
    } catch (err: any) {
      console.error("Chat error:", err);
      setChatMessages([
        ...newMessages, 
        { role: 'model', text: `I am here to help! Feel free to ask any question about resumes, coding, interviews, or any topic.` }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSendPresetMessage = (text: string) => {
    setChatInput(text);
  };

  const handleGetIdeas = async (rank: number, resumeText: string) => {
    setRebuildData(prev => ({ ...prev, [rank]: { loading: true, text: '' } }));
    try {
      const response = await fetch('/api/resume-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobDescription, resumeText })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Request failed");
      }
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("Server returned an invalid response (not JSON). The files may be too large or the server timed out.");
      }

      setRebuildData(prev => ({ ...prev, [rank]: { loading: false, text: data.ideas } }));
    } catch (e: any) {
      setRebuildData(prev => ({ ...prev, [rank]: { loading: false, text: `Error: ${e.message || 'Failed to load ideas. Please try again.'}` } }));
    }
  };

  const steps = [
    "Uploading Resumes",
    "Extracting Text (PDF/TXT)",
    "NLP Preprocessing (Tokenization, Stopwords)",
    "Skill/Keyword Extraction",
    "TF-IDF Vectorization",
    "Cosine Similarity Math",
    "Ranking & Shortlisting"
  ];

  const handleJdFileUpload = async (file: File) => {
    if (!file) return;
    setIsJdParsing(true);
    setJdError(null);
    try {
      const formData = new FormData();
      formData.append('jdFile', file);
      const response = await fetch('/api/parse-jd', {
        method: 'POST',
        body: formData
      });
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("Server returned an invalid response while parsing the Job Description file.");
      }
      if (!response.ok) {
        throw new Error(data.error || "Failed to extract text from Job Description file.");
      }
      setJobDescription(data.text);
      setJdFileName(data.filename || file.name);
    } catch (err: any) {
      console.error(err);
      setJdError(err.message || "Failed to parse Job Description file.");
    } finally {
      setIsJdParsing(false);
    }
  };

  const handleJdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleJdFileUpload(e.target.files[0]);
    }
  };

  const handleJdDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsJdDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleJdFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleClearJd = () => {
    setJobDescription('');
    setJdFileName(null);
    setJdError(null);
    if (jdFileInputRef.current) jdFileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleRunPipeline = async () => {
    if (!jobDescription.trim() || files.length === 0) {
      setError("Please provide a Job Description and at least one Resume file.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults(null);
    setCurrentStep(0);
    setExpandedRow(null);

    // Simulate pipeline steps for UI UX (since backend does it instantly)
    const stepInterval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < steps.length - 1) return prev + 1;
        clearInterval(stepInterval);
        return prev;
      });
    }, 800);

    try {
      const formData = new FormData();
      formData.append("jobDescription", jobDescription);
      files.forEach(file => {
        formData.append("resumes", file);
      });

      const response = await fetch('/api/screen-resumes', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errorMsg = 'Failed to process pipeline. The server may have timed out or the files are too large.';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch (e) {
          // If response is not JSON (e.g. 502 Bad Gateway HTML), just use the default message or status text
          errorMsg = `Server Error (${response.status}): ${response.statusText}. The files might be too large or the server timed out.`;
        }
        throw new Error(errorMsg);
      }

      if (!response.ok) throw new Error("Request failed");
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("Server returned an invalid response (not JSON). The files may be too large or the server timed out.");
      }

      setResults(data.candidates);
      if (data.candidates && data.candidates.length > 0) {
        setExpandedRow(data.candidates[0].rank);
      }
      setCurrentStep(steps.length); // Complete
    } catch (err: any) {
      setError(err.message);
      setIsProcessing(false);
    } finally {
      clearInterval(stepInterval);
      setIsProcessing(false);
    }
  };

  const toggleRow = (rank: number) => {
    if (expandedRow === rank) {
      setExpandedRow(null);
    } else {
      setExpandedRow(rank);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-6 md:p-12 font-sans text-slate-900 selection:bg-teal-100 selection:text-teal-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header with Unique Aesthetic Styling */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-50 via-emerald-50 to-cyan-50 text-teal-800 rounded-full border border-teal-200/80 shadow-xs mb-1">
            <Sparkles className="w-4 h-4 text-teal-600 animate-pulse" />
            <span className="text-xs font-bold tracking-wide uppercase">AI-Powered NLP Engine</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-700 via-emerald-600 to-cyan-600">
              AI Resume Screening
            </span>
          </h1>
          <p className="text-slate-600 max-w-2xl mx-auto text-base md:text-lg leading-relaxed">
            Smart NLP-powered resume screening, TF-IDF cosine matching, and personalized skill recommendations.
          </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2.5">
                  <div className="p-1.5 bg-teal-50 rounded-lg text-teal-700 border border-teal-100">
                    <FileText className="w-4 h-4" />
                  </div>
                  1. Job Description
                </h2>

                {/* Mode Selector Tabs */}
                <div className="flex bg-slate-100/80 p-1 rounded-xl text-xs font-semibold border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setJdMode('write')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      jdMode === 'write'
                        ? 'bg-white text-teal-800 shadow-xs border border-slate-200/40'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PenLine className="w-3.5 h-3.5 text-teal-600" />
                    Write / Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setJdMode('upload')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                      jdMode === 'upload'
                        ? 'bg-white text-teal-800 shadow-xs border border-slate-200/40'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileUp className="w-3.5 h-3.5 text-teal-600" />
                    Upload File {jdFileName && '✓'}
                  </button>
                </div>
              </div>

              {/* WRITE / PASTE MODE */}
              {jdMode === 'write' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setJobDescription(JD_TEMPLATES["Data Scientist"]);
                        setJdFileName(null);
                      }}
                      className="text-xs px-3 py-1 bg-teal-50/70 text-teal-800 rounded-lg hover:bg-teal-100/80 border border-teal-200/70 font-medium transition-colors"
                    >
                      Load Data Scientist JD
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setJobDescription(JD_TEMPLATES["Frontend Developer"]);
                        setJdFileName(null);
                      }}
                      className="text-xs px-3 py-1 bg-emerald-50/70 text-emerald-800 rounded-lg hover:bg-emerald-100/80 border border-emerald-200/70 font-medium transition-colors"
                    >
                      Load Frontend JD
                    </button>
                    {jobDescription && (
                      <button
                        type="button"
                        onClick={handleClearJd}
                        className="text-xs px-3 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 border border-slate-200 ml-auto flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>

                  {jdFileName && (
                    <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-2 rounded-xl text-xs text-emerald-900">
                      <span className="flex items-center gap-2 font-medium">
                        <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        Extracted from uploaded file: <strong className="font-semibold">{jdFileName}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setJdMode('upload')}
                        className="text-emerald-700 font-semibold underline hover:text-emerald-900 ml-2"
                      >
                        Manage File
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <textarea
                      className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none resize-none min-h-[190px] text-slate-800 bg-slate-50/50 hover:bg-white text-sm leading-relaxed transition-colors font-sans"
                      placeholder="Type, write, or paste the Job Description here (skills, qualifications, responsibilities)..."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                    />
                    <div className="flex justify-between items-center text-xs text-slate-400 mt-1 px-1">
                      <span>
                        {jobDescription.trim() ? `${jobDescription.trim().split(/\s+/).length} words | ${jobDescription.length} chars` : '0 words'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setJdMode('upload')}
                        className="text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
                      >
                        <FileUp className="w-3 h-3" /> Or upload a JD document (.pdf/.txt)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* UPLOAD FILE MODE */}
              {jdMode === 'upload' && (
                <div className="space-y-3">
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    className="hidden"
                    ref={jdFileInputRef}
                    onChange={handleJdFileChange}
                  />

                  {isJdParsing ? (
                    <div className="border-2 border-teal-200 bg-teal-50/40 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                      <p className="text-sm font-semibold text-teal-900">Extracting text from Job Description file...</p>
                      <p className="text-xs text-teal-600">Reading PDF / TXT structure with NLP parser</p>
                    </div>
                  ) : jdFileName && jobDescription ? (
                    <div className="bg-white border border-teal-100 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100/80 rounded-lg text-emerald-800">
                            <FileCheck className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{jdFileName}</p>
                            <p className="text-xs text-emerald-800 font-medium">
                              Successfully parsed • {jobDescription.trim().split(/\s+/).length} words • {jobDescription.length} characters
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => jdFileInputRef.current?.click()}
                            className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-white rounded-md transition-colors"
                            title="Replace File"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleClearJd}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white rounded-md transition-colors"
                            title="Clear File"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Preview / Direct Edit Area */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Extracted JD Content (Editable):
                          </span>
                          <button
                            type="button"
                            onClick={() => setJdMode('write')}
                            className="text-xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
                          >
                            <PenLine className="w-3 h-3" /> Full Text View
                          </button>
                        </div>
                        <textarea
                          className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 outline-none resize-none h-[120px] text-slate-700 bg-slate-50/70 text-xs font-mono"
                          value={jobDescription}
                          onChange={(e) => setJobDescription(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsJdDragging(true);
                      }}
                      onDragLeave={() => setIsJdDragging(false)}
                      onDrop={handleJdDrop}
                      onClick={() => jdFileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                        isJdDragging
                          ? 'border-teal-500 bg-teal-50/50'
                          : 'border-slate-300 hover:border-teal-500 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center mx-auto mb-3 border border-teal-100">
                        <FileUp className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        Click or Drag & Drop Job Description file
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Supports <span className="font-semibold text-slate-700">.PDF</span> and <span className="font-semibold text-slate-700">.TXT</span> documents
                      </p>
                    </div>
                  )}

                  {jdError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        {jdError}
                      </span>
                      <button
                        type="button"
                        onClick={() => jdFileInputRef.current?.click()}
                        className="underline font-semibold hover:text-rose-950 ml-2"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2.5">
                  <div className="p-1.5 bg-teal-50 rounded-lg text-teal-700 border border-teal-100">
                    <UploadCloud className="w-4 h-4" />
                  </div>
                  2. Resume Upload (Batch or Single)
                </h2>
                <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-400" /> Skill Suggestions
                </span>
              </div>

              <div 
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50/60 hover:border-teal-500 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-full flex items-center justify-center mx-auto mb-3 border border-teal-100">
                  <FileUp className="w-6 h-6" />
                </div>
                <p className="text-slate-800 font-semibold text-sm">Click to upload Resumes (.pdf, .txt)</p>
                <p className="text-xs text-slate-500 mt-1">Upload multiple candidates to rank them, or 1 resume for personal skill gap analysis</p>
                <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-600" /> Missing Skills Check</span>
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-600" /> Extra Skills to Add</span>
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-emerald-600" /> Match %</span>
                </div>
                <input 
                  type="file" 
                  multiple 
                  accept=".pdf,.txt" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>

              {files.length > 0 && (
                <div className="bg-teal-50/50 border border-teal-100 p-4 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-teal-900">{files.length} Resume File(s) Selected:</p>
                    <button
                      type="button"
                      onClick={() => setFiles([])}
                      className="text-[11px] text-teal-700 hover:text-rose-600 font-medium transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className="text-xs text-teal-900 space-y-1.5 max-h-36 overflow-y-auto">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-teal-100 shadow-2xs">
                        <span className="flex items-center gap-2 truncate max-w-[200px] sm:max-w-xs font-medium text-slate-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {f.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{(f.size / 1024).toFixed(1)} KB</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={handleRunPipeline}
              disabled={isProcessing || files.length === 0 || !jobDescription.trim()}
              className="w-full bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 hover:from-teal-700 hover:via-teal-800 hover:to-slate-800 text-white font-bold py-4 px-6 rounded-xl shadow-md shadow-teal-950/20 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-base sm:text-lg"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5 text-teal-300" />}
              {isProcessing ? 'Analyzing Resumes & Skill Gaps...' : 'Screen Resumes & Get Extra Skill Suggestions'}
            </button>
            
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Right Column: Output / Progress */}
          <div className="space-y-6">
            
            {/* Pipeline Status */}
            {(isProcessing || results) && (
              <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200/80">
                <h2 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-teal-600" />
                  Algorithm Pipeline Status
                </h2>
                <div className="space-y-2.5">
                  {steps.map((step, idx) => {
                    const isDone = currentStep > idx || results !== null;
                    const isActive = currentStep === idx && !results;
                    return (
                      <div key={idx} className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${isActive ? 'bg-teal-50/70 border border-teal-200/80' : ''}`}>
                        {isDone ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : isActive ? (
                          <Loader2 className="w-5 h-5 text-teal-600 animate-spin" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
                        )}
                        <span className={`text-sm font-medium ${isDone ? 'text-slate-800' : isActive ? 'text-teal-900 font-semibold' : 'text-slate-400'}`}>
                          {step}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Results Table */}
            {results && (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-gradient-to-r from-slate-50 via-teal-50/30 to-emerald-50/30 border-b border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-teal-600" /> Candidate Ranking & Extra Skill Suggestions
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Click any candidate row to see missing skills, extra skills to add, and actionable resume tips.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (expandedRow !== null) {
                          setExpandedRow(null);
                        } else if (results.length > 0) {
                          setExpandedRow(results[0].rank);
                        }
                      }}
                      className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors shadow-2xs"
                    >
                      {expandedRow !== null ? 'Collapse View' : 'Expand Top Candidate'}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider font-semibold">
                        <th className="p-4 border-b border-slate-100">Rank</th>
                        <th className="p-4 border-b border-slate-100">Candidate / File</th>
                        <th className="p-4 border-b border-slate-100">Match Score</th>
                        <th className="p-4 border-b border-slate-100">Extra Skills Needed</th>
                        <th className="p-4 border-b border-slate-100">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.map((candidate) => (
                        <React.Fragment key={candidate.rank}>
                          <tr 
                            onClick={() => toggleRow(candidate.rank)}
                            className="hover:bg-teal-50/30 transition-colors cursor-pointer group"
                          >
                            <td className="p-4">
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                candidate.rank === 1 ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300/80 shadow-2xs' : 
                                candidate.rank === 2 ? 'bg-slate-200 text-slate-700' :
                                candidate.rank === 3 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                              }`}>
                                #{candidate.rank}
                              </span>
                            </td>
                            <td className="p-4">
                              <p className="font-bold text-slate-900 flex items-center gap-2">
                                {candidate.filename}
                                {expandedRow === candidate.rank ? (
                                  <ChevronUp className="w-4 h-4 text-teal-600" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-teal-600 transition-colors" />
                                )}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {candidate.skills.slice(0, 3).map((skill, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-teal-50 text-teal-800 border border-teal-100 rounded text-[10px] font-medium">
                                    {skill}
                                  </span>
                                ))}
                                {candidate.skills.length > 3 && (
                                  <span className="px-1.5 py-0.5 text-slate-500 text-[10px]">+{candidate.skills.length - 3}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-slate-900">{candidate.score}%</span>
                                <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                                  <div 
                                    className={`h-full ${candidate.score >= 50 ? 'bg-gradient-to-r from-teal-500 to-emerald-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`} 
                                    style={{ width: candidate.score + '%' }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              {candidate.missingSkills && candidate.missingSkills.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                                  <Plus className="w-3 h-3 text-rose-500" /> {candidate.missingSkills.length} skills to add
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                                  <Check className="w-3 h-3 text-emerald-600" /> Complete Match
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-2xs ${
                                candidate.status === 'Shortlisted' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/80' : 'bg-rose-100 text-rose-800 border border-rose-200/80'
                              }`}>
                                {candidate.status}
                              </span>
                            </td>
                          </tr>
                          
                          {/* Expanded Details Row */}
                          {expandedRow === candidate.rank && (
                            <tr>
                              <td colSpan={5} className="p-0 border-b border-teal-100">
                                <div className="bg-slate-50/80 p-6 animate-in fade-in slide-in-from-top-2 duration-300 space-y-5 border-l-4 border-teal-600">
                                  
                                  {/* Section 1: Crucial Missing Skills */}
                                  <div className="bg-white p-5 rounded-xl border border-rose-100 shadow-2xs space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                                        <span>Missing Essential Skills from Job Description</span>
                                        <span className="text-xs bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full">
                                          Must Add to Resume
                                        </span>
                                      </h4>
                                      <span className="text-[11px] text-slate-500">Add these to pass automated ATS filters</span>
                                    </div>

                                    {candidate.missingSkills && candidate.missingSkills.length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {candidate.missingSkills.map((skill, idx) => (
                                          <span 
                                            key={idx} 
                                            className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                                          >
                                            <Plus className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                            {skill}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-emerald-800 bg-emerald-50 p-2.5 rounded-lg font-medium flex items-center gap-1.5 border border-emerald-200/60">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Great news! All core skills from the job description are mentioned in this resume.
                                      </p>
                                    )}
                                  </div>

                                  {/* Section 2: Extra Recommended Skills to Stand Out */}
                                  {candidate.extraRecommendedSkills && candidate.extraRecommendedSkills.length > 0 && (
                                    <div className="bg-white p-5 rounded-xl border border-teal-100 shadow-2xs space-y-3">
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                          <Sparkles className="w-4 h-4 text-teal-600" />
                                          <span>Extra High-Impact Skills to Stand Out</span>
                                          <span className="text-xs bg-teal-100 text-teal-800 font-semibold px-2 py-0.5 rounded-full">
                                            Bonus Competitive Edge
                                          </span>
                                        </h4>
                                        <span className="text-[11px] text-slate-500">Trending industry tools & domain keywords</span>
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        {candidate.extraRecommendedSkills.map((skill, idx) => (
                                          <span 
                                            key={idx} 
                                            className="bg-teal-50/80 hover:bg-teal-100 text-teal-900 border border-teal-200 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                                          >
                                            <Star className="w-3 h-3 text-amber-500 shrink-0 fill-amber-400" />
                                            {skill}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Section 3: Actionable Resume Phrasing & Improvement Tips */}
                                  {candidate.resumeImprovementTips && candidate.resumeImprovementTips.length > 0 && (
                                    <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-2xs space-y-2.5">
                                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                        <Lightbulb className="w-4 h-4 text-amber-500" />
                                        <span>How to Add These Skills into Your Resume (Actionable Tips)</span>
                                      </h4>
                                      <ul className="space-y-2 text-xs text-slate-700">
                                        {candidate.resumeImprovementTips.map((tip, idx) => (
                                          <li key={idx} className="flex items-start gap-2 bg-amber-50/60 p-2.5 rounded-lg border border-amber-200/50">
                                            <ArrowRight className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                                            <span className="leading-relaxed font-medium">{tip}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}

                                  {/* Section 4: Skills Found in Resume */}
                                  <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      Skills Already Detected in Resume ({candidate.skills.length})
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5">
                                      {candidate.skills.map((skill, idx) => (
                                        <span key={idx} className="bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-md text-xs font-medium">
                                          {skill}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Section 5: AI Recommendation */}
                                  <div className="bg-gradient-to-r from-teal-900 via-teal-950 to-slate-900 text-white p-4 rounded-xl shadow-xs space-y-1">
                                    <h4 className="text-xs font-bold text-teal-200 uppercase tracking-wider flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" /> AI Resume Coach Recommendation
                                    </h4>
                                    <p className="text-xs text-teal-100 leading-relaxed font-medium">
                                      {candidate.recommendation || "Update your resume to include the missing keywords to improve your TF-IDF score."}
                                    </p>
                                  </div>
                                  
                                  {/* Section 6: Domain Pivot Guide */}
                                  {candidate.status === 'Rejected' && (
                                    <div className="pt-2 border-t border-slate-200">
                                      <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-teal-600" />
                                        Domain Pivot & Step-by-Step Resume Rebuilding Guide
                                      </h4>
                                      {!rebuildData[candidate.rank] ? (
                                        <button 
                                          type="button"
                                          // @ts-ignore - fullText exists dynamically
                                          onClick={() => handleGetIdeas(candidate.rank, candidate.fullText)}
                                          className="text-xs px-4 py-2.5 bg-white border border-teal-200 text-teal-800 hover:bg-teal-50/70 rounded-lg transition-colors flex items-center gap-2 shadow-2xs font-bold"
                                        >
                                          <Sparkles className="w-4 h-4 text-teal-600" />
                                          Generate Step-by-Step Project & Pivot Ideas for this JD
                                        </button>
                                      ) : rebuildData[candidate.rank].loading ? (
                                        <div className="flex items-center gap-3 text-xs text-teal-800 bg-teal-50 p-4 rounded-xl border border-teal-100">
                                          <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> Generating tailored project ideas and bullet points to rebuild this resume...
                                        </div>
                                      ) : (
                                        <div className="bg-white p-5 rounded-xl border border-teal-100 text-xs text-slate-800 prose prose-sm max-w-none shadow-2xs leading-relaxed">
                                          <Markdown>{rebuildData[candidate.rank].text}</Markdown>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Floating Chatbot Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        {isChatOpen ? (
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[350px] sm:w-[400px] h-[500px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-4 text-white flex justify-between items-center shadow-xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal-700/60 border border-teal-400/30 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-teal-200" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">AI Career Coach & Assistant</h3>
                  <span className="text-[10px] text-teal-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span> Ready to answer ANY question
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  title="Clear Chat"
                  onClick={() => setChatMessages([{ role: 'model', text: "Hi! I'm your AI Coach & Assistant. Ask me anything about your resume, coding, interviews, or any topic!" }])} 
                  className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors text-xs font-semibold px-2"
                >
                  Clear
                </button>
                <button onClick={() => setIsChatOpen(false)} className="text-teal-200 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/70">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] p-3.5 rounded-2xl text-sm shadow-2xs ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-r from-teal-800 to-slate-900 text-white rounded-br-sm' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'
                  }`}>
                    {msg.role === 'model' ? (
                      <div className="prose prose-sm prose-p:leading-relaxed prose-pre:bg-slate-100 prose-pre:text-slate-800">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-bl-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    <span className="text-xs text-slate-500 ml-1">Thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-3 py-1.5 bg-slate-100/90 border-t border-slate-200/60 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
              <button
                type="button"
                onClick={() => handleSendPresetMessage("How can I improve my resume match score?")}
                className="whitespace-nowrap px-2.5 py-1 bg-white hover:bg-teal-50 border border-slate-200 text-teal-800 rounded-full transition-colors font-medium"
              >
                💡 Improve Score
              </button>
              <button
                type="button"
                onClick={() => handleSendPresetMessage("Explain key Python skills for this role")}
                className="whitespace-nowrap px-2.5 py-1 bg-white hover:bg-teal-50 border border-slate-200 text-teal-800 rounded-full transition-colors font-medium"
              >
                🐍 Python Skills
              </button>
              <button
                type="button"
                onClick={() => handleSendPresetMessage("Give me 3 common interview questions for this job")}
                className="whitespace-nowrap px-2.5 py-1 bg-white hover:bg-teal-50 border border-slate-200 text-teal-800 rounded-full transition-colors font-medium"
              >
                🎯 Interview Q&A
              </button>
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text"
                placeholder="Ask ANY question (resume, coding, general)..."
                className="flex-1 px-4 py-2.5 bg-slate-100/80 border-transparent focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-200 rounded-full text-sm outline-none transition-all placeholder:text-slate-400"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="w-10 h-10 bg-gradient-to-r from-teal-800 to-slate-900 hover:from-teal-700 hover:to-slate-800 text-white rounded-full flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="w-4 h-4 ml-0.5 text-teal-200" />
              </button>
            </form>
          </div>
        ) : (
          <button
            onClick={() => setIsChatOpen(true)}
            className="w-14 h-14 bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 hover:from-teal-700 hover:to-slate-800 text-white rounded-full shadow-xl shadow-teal-950/30 flex items-center justify-center hover:scale-105 transition-all duration-200 border border-teal-600/30"
          >
            <MessageSquare className="w-6 h-6 text-teal-200" />
          </button>
        )}
      </div>

    </div>
  );
}
