"""
Evaluation and Metrics Service
Evaluates classification accuracy, solution quality, safety, source attribution, response time, and user satisfaction
"""

from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from app.models.analysis_event import EvaluationEvent
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class EvaluationMetric(str, Enum):
    """Types of evaluation metrics"""
    ACCURACY = "accuracy"
    PRECISION = "precision"
    RECALL = "recall"
    F1_SCORE = "f1_score"
    SOLUTION_QUALITY = "solution_quality"
    SAFETY_SCORE = "safety_score"
    SOURCE_ATTRIBUTION = "source_attribution"
    RESPONSE_TIME = "response_time"
    USER_SATISFACTION = "user_satisfaction"
    ESCALATION_ACCURACY = "escalation_accuracy"


@dataclass
class ClassificationMetrics:
    """Classification performance metrics"""
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int


@dataclass
class CategoryClassificationMetrics:
    """Multiclass metrics for the actual LLM fault categories."""
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    support: int
    per_class: Dict[str, Dict[str, float]]


@dataclass
class SolutionQualityMetrics:
    """Solution quality evaluation metrics"""
    average_quality_score: float
    clarity_score: float
    applicability_score: float
    expert_evaluations: int
    safe_recommendations: int
    unsafe_recommendations: int
    out_of_scope_recommendations: int


@dataclass
class SourceAttributionMetrics:
    """Source attribution metrics"""
    documented_answers: int
    total_answers: int
    attribution_rate: float
    average_sources_per_answer: float
    source_quality_score: float


@dataclass
class ResponseTimeMetrics:
    """Response time metrics"""
    average_time_ms: float
    median_time_ms: float
    p95_time_ms: float
    p99_time_ms: float
    target_time_ms: float = 2000  # 2 seconds target


@dataclass
class UserSatisfactionMetrics:
    """User satisfaction metrics"""
    average_satisfaction_score: float
    ease_of_use_score: float
    usefulness_score: float
    total_surveys: int
    would_recommend_percentage: float


@dataclass
class EscalationMetrics:
    """Escalation accuracy metrics"""
    correct_escalations: int
    incorrect_escalations: int
    escalation_accuracy: float
    missed_escalations: int
    false_escalations: int


class EvaluationService:
    """Service for evaluating system performance"""
    
    def __init__(self, db: Session):
        self.db = db
        self.labeled_reports: List[Dict[str, Any]] = []
        self.category_labels: List[Dict[str, Any]] = []
        self.evaluation_results: Dict[str, Any] = {}
        self.solution_evaluations: List[Dict[str, Any]] = []
        self.user_surveys: List[Dict[str, Any]] = []
        self.response_times: List[float] = []
        self.escalation_decisions: List[Dict[str, Any]] = []
        self._load_persisted_events()

    def _load_persisted_events(self):
        for event in self.db.query(EvaluationEvent).order_by(EvaluationEvent.timestamp.asc()).all():
            payload = dict(event.payload or {})
            payload['timestamp'] = event.timestamp
            if event.event_type == 'labeled_report':
                self.labeled_reports.append(payload)
            elif event.event_type == 'category_label':
                self.category_labels.append(payload)
            elif event.event_type == 'solution_evaluation':
                self.solution_evaluations.append(payload)
            elif event.event_type == 'user_survey':
                self.user_surveys.append(payload)
            elif event.event_type == 'escalation_decision':
                self.escalation_decisions.append(payload)
            elif event.event_type == 'response_time' and event.numeric_value is not None:
                self.response_times.append(float(event.numeric_value))

    def _persist(self, event_type: str, payload: Optional[Dict[str, Any]] = None, numeric_value: Optional[float] = None):
        event = EvaluationEvent(event_type=event_type, payload=payload or {}, numeric_value=numeric_value)
        self.db.add(event)
        self.db.commit()

    def add_labeled_report(
        self,
        report_id: str,
        true_severity: str,
        true_importance: str,
        true_fault_level: str,
        predicted_severity: str,
        predicted_importance: str,
        predicted_fault_level: str
    ):
        """Add a labeled report for classification evaluation"""
        self.labeled_reports.append({
            'report_id': report_id,
            'true_severity': true_severity,
            'true_importance': true_importance,
            'true_fault_level': true_fault_level,
            'predicted_severity': predicted_severity,
            'predicted_importance': predicted_importance,
            'predicted_fault_level': predicted_fault_level,
            'timestamp': datetime.utcnow()
        })
        self._persist('labeled_report', {k: v for k, v in self.labeled_reports[-1].items() if k != 'timestamp'})
    
    def calculate_classification_metrics(self) -> ClassificationMetrics:
        """Calculate classification performance metrics"""
        if not self.labeled_reports:
            return ClassificationMetrics(
                accuracy=0.0, precision=0.0, recall=0.0, f1_score=0.0,
                true_positives=0, false_positives=0, true_negatives=0, false_negatives=0
            )
        
        # Calculate metrics for severity (as example)
        true_positives = 0
        false_positives = 0
        true_negatives = 0
        false_negatives = 0
        
        for report in self.labeled_reports:
            if report['true_severity'] == report['predicted_severity']:
                if report['true_severity'] in ['HIGH', 'CRITICAL']:
                    true_positives += 1
                else:
                    true_negatives += 1
            else:
                if report['predicted_severity'] in ['HIGH', 'CRITICAL']:
                    false_positives += 1
                else:
                    false_negatives += 1
        
        total = len(self.labeled_reports)
        accuracy = (true_positives + true_negatives) / total if total > 0 else 0.0
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0.0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0.0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        return ClassificationMetrics(
            accuracy=accuracy,
            precision=precision,
            recall=recall,
            f1_score=f1_score,
            true_positives=true_positives,
            false_positives=false_positives,
            true_negatives=true_negatives,
            false_negatives=false_negatives
        )
    
    def add_category_label(self, report_id: str, true_category: str, predicted_category: str):
        """Persist one held-out/expert-labeled LLM category observation."""
        allowed = {"POWER", "SENSOR", "CIRCUIT", "MECHANICAL", "SOFTWARE", "ALARM", "OTHER", "UNKNOWN"}
        truth = true_category.strip().upper()
        predicted = predicted_category.strip().upper()
        if truth not in allowed or predicted not in allowed:
            raise ValueError("Category must be one of the supported LLM fault categories")
        item = {
            "report_id": report_id,
            "true_category": truth,
            "predicted_category": predicted,
            "timestamp": datetime.utcnow(),
        }
        self.category_labels.append(item)
        self._persist("category_label", {k: v for k, v in item.items() if k != "timestamp"})

    def calculate_category_metrics(self) -> CategoryClassificationMetrics:
        """Calculate one-vs-rest precision/recall/F1 per class and macro averages."""
        if not self.category_labels:
            return CategoryClassificationMetrics(
                accuracy=0.0, macro_precision=0.0, macro_recall=0.0,
                macro_f1=0.0, support=0, per_class={}
            )

        labels = sorted({
            item["true_category"] for item in self.category_labels
        } | {
            item["predicted_category"] for item in self.category_labels
        })
        per_class: Dict[str, Dict[str, float]] = {}
        correct = 0
        precisions: List[float] = []
        recalls: List[float] = []
        f1s: List[float] = []

        for item in self.category_labels:
            if item["true_category"] == item["predicted_category"]:
                correct += 1

        for label in labels:
            tp = sum(1 for item in self.category_labels if item["true_category"] == label and item["predicted_category"] == label)
            fp = sum(1 for item in self.category_labels if item["true_category"] != label and item["predicted_category"] == label)
            fn = sum(1 for item in self.category_labels if item["true_category"] == label and item["predicted_category"] != label)
            class_support = sum(1 for item in self.category_labels if item["true_category"] == label)
            precision = tp / (tp + fp) if tp + fp else 0.0
            recall = tp / (tp + fn) if tp + fn else 0.0
            f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
            precisions.append(precision)
            recalls.append(recall)
            f1s.append(f1)
            per_class[label] = {
                "precision": precision, "recall": recall, "f1": f1,
                "support": float(class_support), "tp": float(tp), "fp": float(fp), "fn": float(fn),
            }

        count = len(labels)
        total = len(self.category_labels)
        return CategoryClassificationMetrics(
            accuracy=correct / total,
            macro_precision=sum(precisions) / count if count else 0.0,
            macro_recall=sum(recalls) / count if count else 0.0,
            macro_f1=sum(f1s) / count if count else 0.0,
            support=total,
            per_class=per_class,
        )

    def add_solution_evaluation(
        self,
        report_id: str,
        quality_score: float,  # 1-5 scale
        clarity_score: float,  # 1-5 scale
        applicability_score: float,  # 1-5 scale
        expert_id: str,
        comments: Optional[str] = None
    ):
        """Add expert evaluation of solution quality"""
        self.solution_evaluations.append({
            'report_id': report_id,
            'quality_score': quality_score,
            'clarity_score': clarity_score,
            'applicability_score': applicability_score,
            'expert_id': expert_id,
            'comments': comments,
            'timestamp': datetime.utcnow()
        })
        self._persist('solution_evaluation', {k: v for k, v in self.solution_evaluations[-1].items() if k != 'timestamp'})
    
    def calculate_solution_quality_metrics(self) -> SolutionQualityMetrics:
        """Calculate solution quality metrics"""
        if not self.solution_evaluations:
            return SolutionQualityMetrics(
                average_quality_score=0.0,
                clarity_score=0.0,
                applicability_score=0.0,
                expert_evaluations=0,
                safe_recommendations=0,
                unsafe_recommendations=0,
                out_of_scope_recommendations=0
            )
        
        total = len(self.solution_evaluations)
        avg_quality = sum(e['quality_score'] for e in self.solution_evaluations) / total
        avg_clarity = sum(e['clarity_score'] for e in self.solution_evaluations) / total
        avg_applicability = sum(e['applicability_score'] for e in self.solution_evaluations) / total
        
        # Count unsafe recommendations (quality score < 3)
        unsafe = sum(1 for e in self.solution_evaluations if e['quality_score'] < 3)
        safe = total - unsafe
        
        # Count out of scope (applicability score < 2)
        out_of_scope = sum(1 for e in self.solution_evaluations if e['applicability_score'] < 2)
        
        return SolutionQualityMetrics(
            average_quality_score=avg_quality,
            clarity_score=avg_clarity,
            applicability_score=avg_applicability,
            expert_evaluations=total,
            safe_recommendations=safe,
            unsafe_recommendations=unsafe,
            out_of_scope_recommendations=out_of_scope
        )
    
    def calculate_source_attribution_metrics(
        self,
        documented_answers: int,
        total_answers: int,
        total_sources: int
    ) -> SourceAttributionMetrics:
        """Calculate source attribution metrics"""
        attribution_rate = documented_answers / total_answers if total_answers > 0 else 0.0
        avg_sources = total_sources / total_answers if total_answers > 0 else 0.0
        
        # Source quality based on source types
        source_quality = min(attribution_rate * 1.2, 1.0)  # Adjust based on attribution rate
        
        return SourceAttributionMetrics(
            documented_answers=documented_answers,
            total_answers=total_answers,
            attribution_rate=attribution_rate,
            average_sources_per_answer=avg_sources,
            source_quality_score=source_quality
        )
    
    def add_response_time(self, response_time_ms: float):
        """Record response time"""
        self.response_times.append(response_time_ms)
        self._persist('response_time', numeric_value=float(response_time_ms))
    
    def calculate_response_time_metrics(self) -> ResponseTimeMetrics:
        """Calculate response time metrics"""
        if not self.response_times:
            return ResponseTimeMetrics(
                average_time_ms=0.0,
                median_time_ms=0.0,
                p95_time_ms=0.0,
                p99_time_ms=0.0
            )
        
        sorted_times = sorted(self.response_times)
        total = len(sorted_times)
        
        avg_time = sum(sorted_times) / total
        median_time = sorted_times[total // 2]
        p95_time = sorted_times[int(total * 0.95)] if total > 0 else 0.0
        p99_time = sorted_times[int(total * 0.99)] if total > 0 else 0.0
        
        return ResponseTimeMetrics(
            average_time_ms=avg_time,
            median_time_ms=median_time,
            p95_time_ms=p95_time,
            p99_time_ms=p99_time
        )
    
    def add_user_survey(
        self,
        user_id: str,
        satisfaction_score: float,  # 1-5 scale
        ease_of_use_score: float,  # 1-5 scale
        usefulness_score: float,  # 1-5 scale
        would_recommend: bool,
        comments: Optional[str] = None
    ):
        """Add user satisfaction survey"""
        self.user_surveys.append({
            'user_id': user_id,
            'satisfaction_score': satisfaction_score,
            'ease_of_use_score': ease_of_use_score,
            'usefulness_score': usefulness_score,
            'would_recommend': would_recommend,
            'comments': comments,
            'timestamp': datetime.utcnow()
        })
        self._persist('user_survey', {k: v for k, v in self.user_surveys[-1].items() if k != 'timestamp'})
    
    def calculate_user_satisfaction_metrics(self) -> UserSatisfactionMetrics:
        """Calculate user satisfaction metrics"""
        if not self.user_surveys:
            return UserSatisfactionMetrics(
                average_satisfaction_score=0.0,
                ease_of_use_score=0.0,
                usefulness_score=0.0,
                total_surveys=0,
                would_recommend_percentage=0.0
            )
        
        total = len(self.user_surveys)
        avg_satisfaction = sum(s['satisfaction_score'] for s in self.user_surveys) / total
        avg_ease = sum(s['ease_of_use_score'] for s in self.user_surveys) / total
        avg_usefulness = sum(s['usefulness_score'] for s in self.user_surveys) / total
        recommend_pct = sum(1 for s in self.user_surveys if s['would_recommend']) / total * 100
        
        return UserSatisfactionMetrics(
            average_satisfaction_score=avg_satisfaction,
            ease_of_use_score=avg_ease,
            usefulness_score=avg_usefulness,
            total_surveys=total,
            would_recommend_percentage=recommend_pct
        )
    
    def add_escalation_decision(
        self,
        report_id: str,
        was_escalated: bool,
        should_have_escalated: bool,
        escalation_level: Optional[str] = None
    ):
        """Record escalation decision for accuracy evaluation"""
        self.escalation_decisions.append({
            'report_id': report_id,
            'was_escalated': was_escalated,
            'should_have_escalated': should_have_escalated,
            'escalation_level': escalation_level,
            'timestamp': datetime.utcnow()
        })
        self._persist('escalation_decision', {k: v for k, v in self.escalation_decisions[-1].items() if k != 'timestamp'})
    
    def calculate_escalation_metrics(self) -> EscalationMetrics:
        """Calculate escalation accuracy metrics"""
        if not self.escalation_decisions:
            return EscalationMetrics(
                correct_escalations=0,
                incorrect_escalations=0,
                escalation_accuracy=0.0,
                missed_escalations=0,
                false_escalations=0
            )
        
        correct = 0
        incorrect = 0
        missed = 0
        false = 0
        
        for decision in self.escalation_decisions:
            if decision['was_escalated'] == decision['should_have_escalated']:
                correct += 1
            else:
                incorrect += 1
                if decision['should_have_escalated'] and not decision['was_escalated']:
                    missed += 1
                if not decision['should_have_escalated'] and decision['was_escalated']:
                    false += 1
        
        total = len(self.escalation_decisions)
        accuracy = correct / total if total > 0 else 0.0
        
        return EscalationMetrics(
            correct_escalations=correct,
            incorrect_escalations=incorrect,
            escalation_accuracy=accuracy,
            missed_escalations=missed,
            false_escalations=false
        )
    
    def get_comprehensive_evaluation(self) -> Dict[str, Any]:
        """Get comprehensive evaluation report"""
        return {
            'classification_metrics': self.calculate_category_metrics(),
            'severity_metrics': self.calculate_classification_metrics(),
            'solution_quality_metrics': self.calculate_solution_quality_metrics(),
            'response_time_metrics': self.calculate_response_time_metrics(),
            'user_satisfaction_metrics': self.calculate_user_satisfaction_metrics(),
            'escalation_metrics': self.calculate_escalation_metrics(),
            'evaluation_timestamp': datetime.utcnow().isoformat()
        }
    
    def compare_with_baseline(
        self,
        baseline_metrics: Dict[str, Any],
        current_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compare current metrics with baseline"""
        comparison = {}
        
        for metric_name, baseline_value in baseline_metrics.items():
            if metric_name in current_metrics:
                current_value = current_metrics[metric_name]
                if isinstance(baseline_value, (int, float)):
                    improvement = current_value - baseline_value
                    improvement_pct = (improvement / baseline_value * 100) if baseline_value != 0 else 0.0
                    comparison[metric_name] = {
                        'baseline': baseline_value,
                        'current': current_value,
                        'improvement': improvement,
                        'improvement_percentage': improvement_pct
                    }
        
        return comparison
