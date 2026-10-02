# `opa test policies/` — mirrors the TypeScript policy-engine suite.
package sentinel

import rego.v1

policies := [
	{"id": "pol_exfil", "name": "Customer data", "description": "Customer data must never be sent externally.", "severity": "high", "mode": "block", "enabled": true, "version": 1},
	{"id": "pol_creds", "name": "Credentials", "description": "Credentials must never be transmitted externally.", "severity": "high", "mode": "block", "enabled": true, "version": 1},
	{"id": "pol_prod", "name": "Production deletion", "description": "Production deletion requires human approval.", "severity": "high", "mode": "review", "enabled": true, "version": 1},
	{"id": "pol_pay", "name": "Payments", "description": "Payments above $100 require human approval.", "severity": "high", "mode": "review", "enabled": true, "version": 1},
]

test_blocks_customer_exfil if {
	r := findings with input as {
		"action": {"agent_id": "a", "tool": "send_email", "arguments": {"to": "external@example.com", "attachment": "customers.csv"}, "context": {}},
		"policies": policies,
	}
	some f in r
	f.policy_id == "pol_exfil"
	f.outcome == "block"
}

test_blocks_credential_leak if {
	r := findings with input as {
		"action": {"agent_id": "a", "tool": "send_email", "arguments": {"to": "external@example.com", "body": "key sk-live-abcdefgh12345678"}, "context": {}},
		"policies": policies,
	}
	some f in r
	f.policy_id == "pol_creds"
	f.outcome == "block"
}

test_reviews_prod_deletion if {
	r := findings with input as {
		"action": {"agent_id": "a", "tool": "delete_resource", "arguments": {"id": "db"}, "context": {"env": "production"}},
		"policies": policies,
	}
	some f in r
	f.policy_id == "pol_prod"
	f.outcome == "review"
}

test_reviews_big_payment_allows_small if {
	big := findings with input as {
		"action": {"agent_id": "a", "tool": "refund", "arguments": {"amount": 500}, "context": {}},
		"policies": policies,
	}
	some f in big
	f.outcome == "review"

	small := findings with input as {
		"action": {"agent_id": "a", "tool": "refund", "arguments": {"amount": 20}, "context": {}},
		"policies": policies,
	}
	count(small) == 0
}

test_ignores_disabled_and_allows_dev if {
	r := findings with input as {
		"action": {"agent_id": "a", "tool": "deploy_app", "arguments": {}, "context": {"env": "development"}},
		"policies": [object.union(policies[2], {"enabled": false})],
	}
	count(r) == 0
}
