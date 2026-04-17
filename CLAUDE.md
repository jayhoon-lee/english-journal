# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# English Journal — Project Spec

## Tech Stack
- Next.js (App Router)
- Supabase (PostgreSQL + Auth)
- Anthropic Claude API (claude-sonnet-4-6), streaming
- Vercel deployment

## Auth
- Email/password (Supabase Auth)
- Google OAuth (Supabase Auth built-in)

## Pages (navigation order)
1. /journal        — 일기 작성
2. /my-expressions — 내 표현 관리
3. /quiz           — 퀴즈
4. /new-content    — 새 학습
5. /status         — 레벨·순위

## Core Philosophy
레벨/순위는 행동 횟수가 아닌 영어 품질(EQS)로 결정.
일기 제출마다 Claude가 어휘/문법/표현/정확도 채점 (0~100).
최근 5개 일기 이동 평균 = 현재 실력 (EQS).

## DB Schema
[Notion 스펙 페이지 참고]
https://www.notion.so/345348f2d1448121a7c7c16414c185cd

## Rules
- 모든 쿼리에 user_id 조건 필수 (사용자 격리)
- Claude API는 항상 스트리밍으로
- JSON 응답 형식은 스펙 페이지 참고
