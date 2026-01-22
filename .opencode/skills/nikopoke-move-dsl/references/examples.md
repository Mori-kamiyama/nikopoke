# Move DSL Examples

## Basic Physical Move (Tackle)
```json
{
  "id": "tackle",
  "name": "たいあたり",
  "type": "normal",
  "category": "physical",
  "pp": 35,
  "power": 40,
  "accuracy": 1.0,
  "priority": 0,
  "description": "体当たりで攻撃する。",
  "effects": [
    {
      "type": "damage",
      "power": 40,
      "accuracy": 1.0
    }
  ],
  "tags": ["contact"]
}
```

## Status Move with Chance (Ember)
```json
{
  "id": "ember",
  "name": "ひのこ",
  "type": "fire",
  "category": "special",
  "pp": 25,
  "power": 40,
  "accuracy": 1.0,
  "priority": 0,
  "description": "小さな炎で攻撃する。10%の確率でやけどにする。",
  "effects": [
    {
      "type": "damage",
      "power": 40,
      "accuracy": 1.0
    },
    {
      "type": "chance",
      "p": 0.1,
      "then": [
        {
          "type": "apply_status",
          "statusId": "burn",
          "target": "target"
        }
      ]
    }
  ]
}
```

## Stat Boosting Status Move (Swords Dance)
```json
{
  "id": "swords_dance",
  "name": "つるぎのまい",
  "type": "normal",
  "category": "status",
  "pp": 20,
  "power": null,
  "accuracy": null,
  "priority": 0,
  "description": "攻撃ランクを2段階上げる。",
  "effects": [
    {
      "type": "modify_stage",
      "target": "self",
      "stages": {
        "atk": 2
      }
    }
  ]
}
```

## Multi-hit Move (Fury Swipes)
```json
{
  "id": "fury_swipes",
  "name": "みだれひっかき",
  "type": "normal",
  "category": "physical",
  "pp": 15,
  "power": 18,
  "accuracy": 0.8,
  "priority": 0,
  "description": "2～5回連続で攻撃する。",
  "effects": [
    {
      "type": "repeat",
      "times": {
        "min": 2,
        "max": 5
      },
      "effects": [
        {
          "type": "damage",
          "power": 18,
          "accuracy": 1.0
        }
      ]
    }
  ],
  "tags": ["contact"]
}
```
