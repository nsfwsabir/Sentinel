# Sentinel --- Design System & UI Specification

**Version:** 1.0

## 1. Design Philosophy

Sentinel is security infrastructure.

The interface should communicate:

-   calm
-   precise
-   technical
-   trustworthy
-   focused

It should not communicate: - magical - playful - futuristic AI -
consumer chatbot - marketing-heavy

## 2. Visual Direction

Reference categories: - developer tooling - security consoles -
infrastructure dashboards - observability platforms - database tools

Visual language: - minimal - monochromatic - information dense - highly
legible - restrained - functional

## 3. No AI Slop

Do not use: - purple gradients - purple/blue mesh gradients - glowing
borders - glass cards everywhere - 3D AI graphics - robot
illustrations - giant "AI-powered" labels - sparkles - floating
particles - animated gradient backgrounds - meaningless waveform
graphics

If an element does not help the user understand or make a decision,
remove it.

## 4. Color System

Use a neutral base: - near-white/white background - near-black
foreground - neutral gray secondary text - light neutral gray borders -
restrained green for success - restrained amber for warning - restrained
red for danger

Accent colors should be sparse.

## 5. Typography

Recommended: - Inter - Geist - IBM Plex Sans

Monospace: - JetBrains Mono - IBM Plex Mono

Use monospace for: - IDs - API endpoints - tool names - policy
identifiers - JSON - confidence values - timestamps where useful

## 6. Layout

``` text
┌────────────────────────────────────────────────────┐
│ Sentinel                                  User     │
├──────────────┬─────────────────────────────────────┤
│ Overview     │                                     │
│ Decisions    │            Main Content              │
│ Approvals    │                                     │
│ Policies     │                                     │
│ Agents       │                                     │
│ Tools        │                                     │
│ Settings     │                                     │
└──────────────┴─────────────────────────────────────┘
```

Keep navigation compact.

## 7. Overview

Header:

``` text
Overview

Runtime decisions across your agents.

[Last 24 hours ▾]
```

No giant marketing hero.

Metrics:

``` text
Decisions    1,284
Allowed        941
Review         211
Blocked        132
```

Prefer a simple metric row over colorful cards.

## 8. Decision Table

``` text
TIME       AGENT          TOOL             DECISION
11:42:19   research       send_email       BLOCK
11:41:54   deploy         deploy_app       ALLOW
11:40:11   support        refund            REVIEW
11:38:02   analyst        query_database    ALLOW
```

## 9. Decision Detail

``` text
← Decisions

BLOCKED

send_email

Research Agent
dec_01H8...

ACTION
Recipient
external@example.com

Attachment
customers.csv

POLICIES
Customer data must never leave the organization.

JUDGMENTS
Sensitive data             YES   98%
External recipient         YES   96%
Policy violation           YES   94%
Human approval required    YES   92%

FINAL DECISION
BLOCK

Reason:
Sensitive customer data would be sent to an external recipient.
```

This is the most important screen.

## 10. Approval Queue

Prefer a table/list:

``` text
Pending approval

ACTION                 AGENT       RISK
Deploy production      deployer    HIGH
Send external email    support     HIGH
Refund $500            billing     MEDIUM
```

## 11. Policy Editor

Keep the MVP simple:

``` text
Policy name

Production deletion

Description

Production resources may not be deleted
without human approval.

Severity

High

Enforcement

Require approval

[Save policy]
```

Avoid complex visual policy builders in the MVP.

## 12. Agent Page

Display: - agent name - status - tools - permissions - recent activity

## 13. Agent Action Simulator

This should be a major demo feature.

``` text
┌───────────────────────────────────────────┐
│ Simulate action                           │
├───────────────────────────────────────────┤
│ Agent                                     │
│ [Research Agent                     ▼]    │
│                                           │
│ Tool                                      │
│ [send_email                         ▼]    │
│                                           │
│ Arguments                                 │
│ {                                         │
│   "to": "external@example.com",           │
│   "attachment": "customers.csv"           │
│ }                                         │
│                                           │
│             [Evaluate action]             │
└───────────────────────────────────────────┘
```

After evaluation:

``` text
BLOCKED
96% confidence
3 policies matched

[View decision]
```

## 14. Policy Simulation

Future feature:

``` text
Policy:
External customer data must be blocked.

Tested against:
1,284 historical decisions

Would block:
37

Would review:
12

Would remain allowed:
1,235
```

## 15. Status Language

Use: - ALLOW - REVIEW - BLOCK

Avoid vague labels such as "Good", "Bad", or "AI says no".

## 16. Confidence Display

Prefer:

``` text
Sensitive data
YES · 98%
```

Confidence is evidence, not truth.

## 17. Icons

Use icons sparingly: - shield - check - alert - block - clock - agent -
tool - policy - search - settings

Do not put an icon in every table cell.

## 18. Motion

Only subtle motion: - page transitions - dropdowns - modal transitions -
loading indicators

Avoid continuous decorative animation.

## 19. Empty States

Example:

``` text
No decisions yet.

Connect an agent and submit your first action
to start evaluating runtime policy.
```

## 20. Error States

Example:

``` text
Evaluation unavailable

Sentinel could not obtain a judgment.

The action was not executed.

[Retry] [View logs]
```

## 21. Accessibility

Required: - keyboard navigation - visible focus states - sufficient
contrast - semantic HTML - screen-reader labels - no color-only status
indicators

## 22. Design Principle

Every screen should help answer:

### What happened?

Agent attempted an action.

### Why did Sentinel decide this?

Policy + evidence + judgments.

### What can I do?

Approve, reject, inspect, or change policy.

If a screen does not help answer one of these, simplify it.
