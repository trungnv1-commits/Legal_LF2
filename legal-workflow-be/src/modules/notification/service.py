"""Notification service -- send emails via SMTP."""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER or "legal@apero.vn")
APP_URL = os.environ.get("APP_URL", "https://lww-frontend-21672960606.asia-southeast1.run.app")


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    print(f"[NOTIFY] send_email called: to={to_email}, subject={subject[:50]}, SMTP_USER={SMTP_USER}, has_pass={bool(SMTP_PASS)}")
    """Send email via SMTP. Returns True on success."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"[NOTIFY] SMTP not configured. Would send to={to_email} subject={subject}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"Legal Workflow <{SMTP_FROM}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
        print(f"[NOTIFY] Email sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[NOTIFY] Email failed to {to_email}: {e}")
        return False


def notify_send_back(
    task_code: str,
    task_title: str,
    task_id: str,
    submitter_email: str,
    reviewer_name: str,
    rejected_steps: list[dict],
):
    """Checker/Approver sends feedback back to Submitter."""
    steps_html = ""
    for s in rejected_steps:
        steps_html += f"<tr><td style='padding:6px;border:1px solid #ddd'>{s.get('name','')}</td><td style='padding:6px;border:1px solid #ddd;color:#dc2626'>REJECTED</td><td style='padding:6px;border:1px solid #ddd'>{s.get('comment','')}</td></tr>"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1e40af;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">Legal Workflow - Feedback</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p>Task <strong>{task_code}</strong> - <strong>{task_title}</strong> has been reviewed by <strong>{reviewer_name}</strong>.</p>
            <p style="color:#dc2626;font-weight:bold">Some steps need revision:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr style="background:#f3f4f6">
                    <th style="padding:8px;border:1px solid #ddd;text-align:left">Step</th>
                    <th style="padding:8px;border:1px solid #ddd;text-align:left">Status</th>
                    <th style="padding:8px;border:1px solid #ddd;text-align:left">Comment</th>
                </tr>
                {steps_html}
            </table>
            <a href="{APP_URL}/legal/tasks/{task_id}" style="display:inline-block;background:#1e40af;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:8px">View Task</a>
            <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent from Legal Workflow System</p>
        </div>
    </div>
    """
    return send_email(submitter_email, f"[Legal] Feedback: {task_code} - {task_title}", html)


def notify_submitted(
    task_code: str,
    task_title: str,
    task_id: str,
    reviewer_email: str,
    submitter_name: str,
):
    """Submitter notifies Checker/Approver that task is ready for review."""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#059669;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">Legal Workflow - New Review Request</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p><strong>{submitter_name}</strong> has submitted task <strong>{task_code}</strong> - <strong>{task_title}</strong> for your review.</p>
            <a href="{APP_URL}/legal/tasks/{task_id}" style="display:inline-block;background:#059669;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:8px">Review Task</a>
            <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent from Legal Workflow System</p>
        </div>
    </div>
    """
    return send_email(reviewer_email, f"[Legal] Review needed: {task_code} - {task_title}", html)


def notify_assigned(
    task_code: str,
    task_title: str,
    task_id: str,
    assignee_email: str,
    assigner_name: str,
):
    """Notify assigned person that a task has been assigned to them."""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1e3a5f;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0">Legal Workflow - Task Assigned</h2>
        </div>
        <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p><strong>{assigner_name}</strong> has assigned task <strong>{task_code}</strong> - <strong>{task_title}</strong> to you.</p>
            <p>Please review and take action.</p>
            <a href="{APP_URL}/legal/tasks/{task_id}" style="display:inline-block;background:#1e3a5f;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;margin-top:8px">View Task</a>
            <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent from Legal Workflow System</p>
        </div>
    </div>
    """
    return send_email(assignee_email, f"[Legal] Task assigned to you: {task_code} - {task_title}", html)
