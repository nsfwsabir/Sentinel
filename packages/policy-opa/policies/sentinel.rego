# Sentinel deterministic policies in Rego. Mirrors @sentinel/policy-engine
# (TypeScript) rule-for-rule; the TS engine remains the fail-closed fallback
# when the WASM bundle is unavailable. Input and output shapes match the TS
# engine so @sentinel/decision-engine is untouched.
#
# Input:
#   { "action": { "agent_id", "tool", "arguments", "context" },
#     "policies": [{ "id", "name", "description", "mode", "enabled" }] }
# Output (entrypoint sentinel/findings):
#   [{ "policy_id", "outcome", "reason" }]
package sentinel

import rego.v1

args_text := lower(json.marshal(input.action.arguments))

enabled_policy contains p if {
	some p in input.policies
	p.enabled
}

recipient := r if {
	r := lower(object.get(input.action.arguments, "to", object.get(input.action.arguments, "recipient", object.get(input.action.arguments, "email", ""))))
}

external_send_tools := {"send_email", "http_post", "webhook_post", "slack_post", "upload_external"}

destructive_tools := {"delete_resource", "delete_database", "drop_database", "deploy_app", "destroy_infra", "rm_production"}

is_external if {
	recipient != ""
	not input.action.context.internal == true
}

is_external_send if {
	external_send_tools[lower(input.action.tool)]
	is_external
}

has_customer_data if {
	contains(args_text, "customers.csv")
} else if {
	contains(args_text, "customer_data")
} else if {
	regex.match(`\bssn\b`, args_text)
} else if {
	contains(args_text, "passport")
}

has_credential if {
	regex.match(`sk-(live|test)-[a-z0-9]{8,}`, args_text)
} else if {
	regex.match(`AKIA[0-9A-Z]{16}`, args_text)
} else if {
	regex.match(`-----BEGIN (RSA )?PRIVATE KEY-----`, args_text)
} else if {
	contains(args_text, "\"api_key\"")
} else if {
	contains(args_text, "\"secret\"")
} else if {
	contains(args_text, "\"password\"")
} else if {
	contains(args_text, "\"token\"")
}

is_destructive if {
	destructive_tools[lower(input.action.tool)]
} else if {
	regex.match(`delete|destroy|drop`, lower(input.action.tool))
}

targets_prod if {
	lower(object.get(input.action.context, "env", object.get(input.action.context, "environment", "development"))) in {"production", "prod"}
}

payment_amount := n if {
	n := to_number(object.get(input.action.arguments, "amount", object.get(input.action.arguments, "value", object.get(input.action.arguments, "total", null))))
}

is_payment_tool if {
	lower(input.action.tool) in {"refund", "charge", "payment", "transfer", "send_payment"}
}

wants_external_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "external")
}

wants_external_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "exfil")
}

wants_external_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "customer data")
}

wants_credential_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "credential")
}

wants_credential_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "secret")
}

wants_credential_block contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "api key")
}

wants_prod_approval contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "production")
}

wants_payment_approval contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "payment")
}

wants_payment_approval contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "$100")
}

wants_payment_approval contains p if {
	some p in enabled_policy
	contains(lower(sprintf("%s %s", [p.name, p.description])), "refund")
}

# Policy mode wins; non-block modes degrade to review (never allow).
mode_outcome("block") := "block"

default mode_outcome(_) := "review"

# 1. Customer data exfiltration -> policy mode (usually block).
findings contains f if {
	some p in wants_external_block
	has_customer_data
	is_external_send
	f := {"policy_id": p.id, "outcome": p.mode, "reason": sprintf("Customer data would be sent to external recipient %s.", [recipient])}
}

# 2. Credential transmission -> block.
findings contains f if {
	some p in wants_credential_block
	has_credential
	is_external_send
	f := {"policy_id": p.id, "outcome": "block", "reason": "Credentials detected in arguments destined for external recipient."}
}

# 3. Production destruction -> at least review.
findings contains f if {
	some p in wants_prod_approval
	is_destructive
	targets_prod
	f := {"policy_id": p.id, "outcome": mode_outcome(p.mode), "reason": sprintf("Destructive action '%s' targets production and requires human approval.", [input.action.tool])}
}

# 4. Payments above $100 -> review.
findings contains f if {
	some p in wants_payment_approval
	is_payment_tool
	payment_amount > 100
	f := {"policy_id": p.id, "outcome": mode_outcome(p.mode), "reason": sprintf("Payment amount $%v exceeds $100 approval threshold.", [payment_amount])}
}
