import { useState, type SubmitEvent } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LABELS, PAGE_TITLES } from "@/lib/messages"

// Step 0 mockup — no backend call, no AuthContext yet (that's step 9).
// Submit is inert; state exists only so the form looks/behaves like the
// real thing (controlled inputs, disabled-while-submitting affordance).
export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error] = useState<string | null>(null)
  const [isSubmitting] = useState(false)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">SwiftTrack</CardTitle>
          <CardDescription>{PAGE_TITLES.loginActivation}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              Log In
            </Button>

            <Link
              to="/activate"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {LABELS.activateAccountLink}
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
