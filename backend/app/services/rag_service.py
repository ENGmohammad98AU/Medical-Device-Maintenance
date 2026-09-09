"""
RAG (Retrieval-Augmented Generation) Service
Uses ChromaDB for vector storage and LangChain for retrieval and generation
Reduces hallucination by relying on trusted technical sources
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import json
import re


@dataclass
class DocumentChunk:
    """Document chunk for vector storage"""
    id: str
    text: str
    metadata: Dict[str, Any]
    source: str
    confidence: float


@dataclass
class RetrievalResult:
    """Result from vector retrieval"""
    chunks: List[DocumentChunk]
    query: str
    similarity_scores: List[float]
    sources: List[str]


@dataclass
class GenerationResult:
    """Result from LLM generation"""
    generated_text: str
    sources: List[str]
    confidence: float
    requires_review: bool


NO_REFERENCE_MESSAGE = "لا توجد حالياً معلومات مرجعية كافية لتشخيص هذا العطل. يرجى إضافة المرجع الفني الخاص بالجهاز."


class RAGService:
    """Service for RAG-based knowledge retrieval and generation"""
    
    def __init__(self, include_demo_documents: bool = False):
        # In-memory document storage (replace with ChromaDB in production)
        self.document_chunks: List[DocumentChunk] = []
        self.chunk_size = 500
        self.chunk_overlap = 50
        
        # Demo documents are opt-in and must never enter the production path.
        if include_demo_documents:
            self._initialize_sample_documents()
    
    def _initialize_sample_documents(self):
        """Initialize with sample technical documents"""
        
        # Ventilator troubleshooting document
        vent_doc = """
        Ventilator Troubleshooting Guide - Dräger Evita V500
        
        Common Error Codes:
        E001: Power supply failure - Check mains connection and battery backup
        E002: Oxygen supply pressure low - Verify O2 source and pressure regulator
        E003: Patient circuit leak - Inspect all tubing connections and humidifier
        E004: Flow sensor calibration required - Run calibration procedure
        E005: Expiratory valve failure - Immediate service required, do not use
        
        Safety Precautions:
        - Always have manual ventilation bag ready
        - Never disconnect patient without backup
        - Monitor patient vitals continuously
        - Ensure proper oxygen supply before starting
        
        Troubleshooting Steps:
        1. Check power supply and connections
        2. Verify oxygen supply pressure (should be 50-60 psi)
        3. Inspect patient circuit for leaks
        4. Check alarm settings and thresholds
        5. Review error logs in system menu
        6. Perform self-test from maintenance menu
        7. If issue persists, contact biomedical engineering
        
        Calibration Procedures:
        - Flow sensor calibration using test lung
        - Pressure transducer zeroing
        - O2 sensor calibration with known gas mixture
        - Volume accuracy verification
        
        Parts List:
        - Expiratory valve assembly
        - Flow sensor module
        - O2 sensor
        - Patient circuit tubing
        - Battery pack
        """
        
        # Patient monitor troubleshooting document
        monitor_doc = """
        Patient Monitor Troubleshooting - Philips IntelliVue MX450
        
        Common Error Codes:
        E101: ECG lead off - Check electrode connections
        E102: SpO2 sensor failure - Replace sensor or check cable
        E103: NIBP cuff leak - Replace cuff or check tubing
        E104: Temperature probe error - Check probe connection
        E105: Display failure - Check display cable and power
        
        Safety Precautions:
        - Never rely solely on monitor readings
        - Cross-check with clinical assessment
        - Ensure proper electrode placement
        - Regular calibration required
        
        Troubleshooting Steps:
        1. Check all sensor connections
        2. Verify electrode placement and quality
        3. Inspect cables for damage
        4. Check power supply
        5. Review alarm configuration
        6. Perform self-test
        7. Contact support if issue persists
        
        Maintenance Schedule:
        - Daily: Check electrode quality
        - Weekly: Calibrate SpO2 sensor
        - Monthly: Check NIBP accuracy
        - Quarterly: Full system calibration
        """
        
        # Defibrillator troubleshooting document
        defib_doc = """
        Defibrillator Maintenance - Philips HeartStart XL
        
        Critical Safety Notes:
        - Device must be checked daily
        - Battery must be fully charged
        - Pads must be within expiration date
        - Regular self-test required
        
        Error Codes:
        D001: Battery low - Charge immediately
        D002: Pads expired - Replace pads
        D003: Self-test failed - Do not use, contact service
        D004: Energy delivery failure - Emergency service required
        
        Emergency Procedures:
        1. Ensure patient safety
        2. Check battery charge
        3. Verify pad connections
        4. Check for error messages
        5. If device fails, use backup immediately
        
        Maintenance Requirements:
        - Daily: Battery charge check, pad expiration check
        - Weekly: Self-test verification
        - Monthly: Full functional test
        - Quarterly: Professional calibration
        """

        hamilton_doc = """
        Ventilator Troubleshooting Guide - Hamilton Medical C6

        Common Error Codes:
        H001: Power supply failure - Check mains connection and battery status
        H002: Oxygen supply pressure low - Verify the oxygen source and regulator
        H003: Patient circuit leak - Inspect tubing, connections, and humidifier
        H004: Flow sensor calibration required - Run the approved calibration procedure

        Troubleshooting Steps:
        1. Keep backup ventilation available and assess patient safety
        2. Check mains power, battery status, and oxygen supply
        3. Inspect the patient circuit and tubing for leaks or obstruction
        4. Review alarms and event logs on the ventilator
        5. Run the device self-test or contact biomedical engineering

        Safety Precautions:
        - Never disconnect a patient without backup ventilation
        - Use only approved circuits and sensors
        - Escalate persistent alarms to biomedical engineering
        """

        mx800_doc = """
        Patient Monitor Troubleshooting - Philips MX800

        Common Error Codes:
        M001: ECG lead off - Check electrode placement and lead connections
        M002: SpO2 sensor failure - Inspect the sensor, cable, and patient site
        M003: NIBP cuff leak - Check cuff size, tubing, and connector
        M004: Display failure - Check power and display connections; escalate if persistent

        Troubleshooting Steps:
        1. Confirm the monitor is connected to power
        2. Check ECG, SpO2, temperature, and NIBP sensor connections
        3. Inspect cables and accessories for visible damage
        4. Review active alarms and perform the monitor self-test
        5. Contact biomedical engineering if the fault persists

        Safety Precautions:
        - Do not rely on monitor readings without clinical assessment
        - Verify sensor placement before interpreting alarms
        - Use approved accessories and replacement sensors
        """

        perfusor_doc = """
        Infusion Pump Troubleshooting - B. Braun Perfusor Space

        Common Error Codes:
        B001: Occlusion detected - Check the line for kinks and closed clamps
        B002: Battery low - Connect the pump to mains power and replace the battery if needed
        B003: Syringe not detected - Confirm syringe size, placement, and fixation
        B004: Infusion stopped - Check alarms, line patency, and programmed settings

        Troubleshooting Steps:
        1. Stop and assess the infusion according to clinical procedure
        2. Check syringe placement, line routing, clamps, and occlusion
        3. Verify the programmed rate and volume with the clinical order
        4. Check battery and mains power
        5. Escalate repeated alarms to biomedical engineering

        Safety Precautions:
        - Do not bypass an occlusion or alarm
        - Verify medication and rate before restarting infusion
        - Use only approved syringes and administration sets
        """
        
        # Add documents to storage
        self._add_document(vent_doc, "Ventilator_Troubleshooting", "Dräger", "Evita V500", "VENTILATOR")
        self._add_document(monitor_doc, "Patient_Monitor_Troubleshooting", "Philips", "IntelliVue MX450", "PATIENT_MONITOR")
        self._add_document(defib_doc, "Defibrillator_Maintenance", "Philips", "HeartStart XL", "DEFIBRILLATOR")
        self._add_document(hamilton_doc, "Hamilton_C6_Troubleshooting", "Hamilton Medical", "C6", "VENTILATOR")
        self._add_document(mx800_doc, "Philips_MX800_Troubleshooting", "Philips", "MX800", "PATIENT_MONITOR")
        self._add_document(perfusor_doc, "Perfusor_Space_Troubleshooting", "B. Braun", "Perfusor Space", "SYRINGE_PUMP")
    
    def _add_document(self, text: str, title: str, manufacturer: str, model: str, device_type: str):
        """Add document to storage with chunking"""
        chunks = self._chunk_text(text)
        
        for i, chunk in enumerate(chunks):
            doc_chunk = DocumentChunk(
                id=f"{title}_{i}",
                text=chunk,
                metadata={
                    "title": title,
                    "device_type": device_type,
                    "manufacturer": manufacturer,
                    "model": model,
                    "chunk_index": i,
                    "total_chunks": len(chunks)
                },
                source=f"{manufacturer} {model} Service Manual",
                confidence=0.9
            )
            self.document_chunks.append(doc_chunk)
    
    def _chunk_text(self, text: str) -> List[str]:
        """Split text into chunks"""
        chunks = []
        current_lines = []
        current_word_count = 0

        for line in text.splitlines():
            line_word_count = len(line.split())
            if current_lines and current_word_count + line_word_count > self.chunk_size:
                chunks.append("\n".join(current_lines))
                current_lines = []
                current_word_count = 0
            current_lines.append(line)
            current_word_count += line_word_count

        if current_lines:
            chunks.append("\n".join(current_lines))
        
        return chunks
    
    def retrieve(self, query: str, top_k: int = 3) -> RetrievalResult:
        """
        Retrieve relevant document chunks based on query
        
        Args:
            query: Search query
            top_k: Number of top results to return
            
        Returns:
            RetrievalResult with relevant chunks and metadata
        """
        query_lower = query.lower()
        
        # Simple keyword matching (replace with vector similarity in production)
        scored_chunks = []
        
        for chunk in self.document_chunks:
            chunk_lower = chunk.text.lower()
            
            # Calculate simple similarity score
            query_words = set(query_lower.split())
            chunk_words = set(chunk_lower.split())
            
            intersection = query_words.intersection(chunk_words)
            score = len(intersection) / max(len(query_words), 1)
            
            if score > 0:
                scored_chunks.append((chunk, score))
        
        # Sort by score and get top_k
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        top_chunks = scored_chunks[:top_k]
        
        chunks = [chunk for chunk, score in top_chunks]
        scores = [score for chunk, score in top_chunks]
        sources = list(set([chunk.source for chunk in chunks]))
        
        return RetrievalResult(
            chunks=chunks,
            query=query,
            similarity_scores=scores,
            sources=sources
        )

    @staticmethod
    def _tokens(text: str) -> set[str]:
        stop_words = {
            'a', 'an', 'and', 'the', 'is', 'in', 'on', 'to', 'of', 'for', 'with',
            'device', 'error', 'fault', 'problem', 'issue', 'check', 'please',
            'جهاز', 'عطل', 'خطأ', 'مشكلة', 'يرجى', 'في', 'من', 'على', 'و',
        }
        return {
            token for token in re.findall(r"[\w-]+", text.lower())
            if len(token) > 1 and token not in stop_words
        }

    def retrieve_for_device(
        self,
        query: str,
        device_type: str,
        manufacturer: Optional[str] = None,
        model: Optional[str] = None,
        top_k: int = 3,
    ) -> RetrievalResult:
        """Retrieve only from the reference manual assigned to the device."""
        query_tokens = self._tokens(query)
        normalized_type = device_type.upper().replace("-", "_").replace(" ", "_")
        candidates = [
            chunk for chunk in self.document_chunks
            if chunk.metadata.get("device_type") == normalized_type
            and (not manufacturer or chunk.metadata.get("manufacturer", "").casefold() == manufacturer.casefold())
            and (not model or chunk.metadata.get("model", "").casefold() == model.casefold())
        ]
        scored_chunks = []
        for chunk in candidates:
            overlap = query_tokens.intersection(self._tokens(chunk.text))
            score = len(overlap) / max(len(query_tokens), 1)
            if score > 0:
                scored_chunks.append((chunk, score))
        scored_chunks.sort(key=lambda item: item[1], reverse=True)
        selected = scored_chunks[:top_k]
        return RetrievalResult(
            chunks=[chunk for chunk, _ in selected],
            query=query,
            similarity_scores=[score for _, score in selected],
            sources=list(dict.fromkeys(chunk.source for chunk, _ in selected)),
        )
    
    def generate_response(
        self,
        query: str,
        retrieval_result: RetrievalResult,
        user_role: str
    ) -> GenerationResult:
        """
        Generate response based on retrieved context
        
        Args:
            query: Original query
            retrieval_result: Results from retrieval step
            user_role: Role of the user
            
        Returns:
            GenerationResult with generated text and metadata
        """
        if not retrieval_result.chunks:
            return GenerationResult(
                generated_text=NO_REFERENCE_MESSAGE,
                sources=[],
                confidence=0.0,
                requires_review=True
            )
        
        # Combine retrieved chunks
        context = "\n\n".join([chunk.text for chunk in retrieval_result.chunks])
        
        # Return retrieved source text only. No synthetic diagnosis is generated.
        response = f"المحتوى المرجعي المطابق:\n\n{context}"
        
        # Calculate confidence based on retrieval scores
        avg_score = sum(retrieval_result.similarity_scores) / len(retrieval_result.similarity_scores)
        confidence = min(avg_score * 1.2, 0.95)  # Adjust confidence
        
        # Determine if review required
        requires_review = confidence < 0.7 or user_role.lower() not in ['biomedical_engineer', 'administrator']
        
        return GenerationResult(
            generated_text=response,
            sources=retrieval_result.sources,
            confidence=confidence,
            requires_review=requires_review
        )
    
    def rag_pipeline(
        self,
        query: str,
        user_role: str,
        device_type: Optional[str] = None,
        manufacturer: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Complete RAG pipeline: retrieve and generate
        
        Args:
            query: User query
            user_role: Role of the user
            
        Returns:
            Complete RAG result with retrieval and generation
        """
        # Step 1: Retrieve relevant documents
        retrieval_result = (
            self.retrieve_for_device(query, device_type, manufacturer, model)
            if device_type else self.retrieve(query)
        )
        
        # Step 2: Generate response
        generation_result = self.generate_response(query, retrieval_result, user_role)
        
        # Step 3: Compile audit trail
        audit_trail = {
            "query": query,
            "user_role": user_role,
            "retrieved_chunks": len(retrieval_result.chunks),
            "sources": retrieval_result.sources,
            "similarity_scores": retrieval_result.similarity_scores,
            "confidence": generation_result.confidence,
            "requires_review": generation_result.requires_review,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "response": generation_result.generated_text,
            "sources": generation_result.sources,
            "confidence": generation_result.confidence,
            "requires_review": generation_result.requires_review,
            "audit_trail": audit_trail,
            "retrieved_context": [chunk.text for chunk in retrieval_result.chunks]
        }
    
    def add_document(self, text: str, metadata: Dict[str, Any]):
        """Add a new document to the knowledge base"""
        chunks = self._chunk_text(text)
        
        for i, chunk in enumerate(chunks):
            doc_chunk = DocumentChunk(
                id=f"doc_{datetime.utcnow().timestamp()}_{i}",
                text=chunk,
                metadata={**metadata, "chunk_index": i, "total_chunks": len(chunks)},
                source=metadata.get("source", "Unknown"),
                confidence=0.8
            )
            self.document_chunks.append(doc_chunk)
    
    def get_audit_trail(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get audit trail of RAG operations (mock implementation)"""
        # In production, this would query a database
        return []
